import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { getRuntimeSecret } from '../server/runtime-secrets.mjs';
import { CollectionError, SOURCES } from './config.mjs';
import { listingIdentity, validateJobId } from './identity.mjs';
import { collectionControl } from './control.mjs';

const sourceKey = source => `recruitment:job-source:${source}`;
export const jobKey = id => `recruitment:job:${id}`;
const visibleJobs = `j.key LIKE 'recruitment:job:%' AND NOT EXISTS (
  SELECT 1 FROM app_setting e WHERE e.key LIKE 'recruitment:job-exclusion:%'
    AND (e.key = j.value->>'exclusionKey' OR
      (e.value->>'source' = j.value->>'source' AND e.value->>'url' = j.value->>'url'))) `;
const currentStatus = `CASE WHEN NULLIF(j.value->>'deadline', '')::timestamptz <= now()
  THEN 'CLOSED' ELSE COALESCE(j.value->>'status', 'UNKNOWN') END`;
const listingLock = (client, key) => client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);

export function createCollectionStore() {
  const connectionString = getRuntimeSecret('DATABASE_URL');
  if (!connectionString) throw new CollectionError('DATABASE_NOT_CONFIGURED');
  const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  // 접속 문자열과 서버 오류 전문은 작업 로그에 남기지 않는다.
  pool.on('error', () => {});
  return collectionStore(pool);
}

export function collectionStore(pool) {
  return {
    ...collectionControl(pool),
    async close() { await pool.end(); },
    async completedReport(source, runKey) {
      const { rows } = await pool.query('SELECT value FROM app_setting WHERE key = $1', [`recruitment:job-run:${source}:${runKey}`]);
      return rows[0]?.value ?? null;
    },
    async claim(source, runKey) {
      if (!SOURCES[source] || !/^(?:\d{4}-\d{2}-\d{2}|manual-[a-f\d-]{36})$/.test(runKey)) throw new CollectionError('INVALID_RUN');
      const token = randomUUID();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // 수동 실행이 최신 상태를 바꿔도 완료된 예약 회차는 다시 시작하지 않는다.
        // 행 잠금 이후 새 statement로 이력을 읽어 finish와의 경쟁도 방지한다.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [sourceKey(source)]);
        await client.query('SELECT key FROM app_setting WHERE key = $1 FOR UPDATE', [sourceKey(source)]);
        const finished = await client.query('SELECT key FROM app_setting WHERE key = $1', [`recruitment:job-run:${source}:${runKey}`]);
        if (finished.rowCount) { await client.query('COMMIT'); return null; }
        const { rows } = await client.query(`
        INSERT INTO app_setting(key, value) VALUES ($1, jsonb_build_object(
          'source', $2::text, 'runKey', $3::text, 'token', $4::text, 'state', 'RUNNING', 'attempts', 1,
          'startedAt', clock_timestamp(), 'leaseUntil', extract(epoch FROM clock_timestamp()) * 1000 + 300000))
        ON CONFLICT(key) DO UPDATE SET value = app_setting.value || EXCLUDED.value || jsonb_build_object(
          'attempts', CASE WHEN app_setting.value->>'runKey' = $3 THEN COALESCE((app_setting.value->>'attempts')::int, 0) + 1 ELSE 1 END)
        WHERE (app_setting.value->>'state' <> 'RUNNING' OR (app_setting.value->>'leaseUntil')::numeric < extract(epoch FROM clock_timestamp()) * 1000)
          AND (app_setting.value->>'runKey' IS DISTINCT FROM $3 OR
            (app_setting.value->>'state' = 'RUNNING' AND COALESCE((app_setting.value->>'attempts')::int, 0) < 3))
        RETURNING value`, [sourceKey(source), source, runKey, token]);
        await client.query('COMMIT');
        if (!rows.length) return null;
        return { source, runKey, token, pendingUrls: Array.isArray(rows[0].value.pendingUrls) ? rows[0].value.pendingUrls : [] };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    async heartbeat(claim) {
      let result;
      try { result = await pool.query(`UPDATE app_setting SET value = value || jsonb_build_object(
          'leaseUntil', extract(epoch FROM clock_timestamp()) * 1000 + 300000)
        WHERE key = $1 AND value->>'token' = $2 AND value->>'state' = 'RUNNING'
          AND (value->>'leaseUntil')::numeric >= extract(epoch FROM clock_timestamp()) * 1000`, [sourceKey(claim.source), claim.token]); }
      catch { throw new CollectionError('LEASE_LOST'); }
      if (result.rowCount !== 1) throw new CollectionError('LEASE_LOST');
    },
    async finish(claim, result) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const lock = await client.query(`SELECT key FROM app_setting WHERE key = $1
          AND value->>'token' = $2 AND value->>'state' = 'RUNNING'
          AND (value->>'leaseUntil')::numeric >= extract(epoch FROM clock_timestamp()) * 1000 FOR UPDATE`, [sourceKey(claim.source), claim.token]);
        if (lock.rowCount !== 1) throw new CollectionError('LEASE_LOST');
        let stored = 0, excluded = 0;
        const jobs = result.jobs.map(job => {
          if (job.source !== claim.source) throw new CollectionError('INVALID_JOB');
          validateJobId(job.id);
          return { ...job, ...listingIdentity(job.source, job.url) };
        }).sort((a, b) => a.exclusionKey.localeCompare(b.exclusionKey));
        for (const job of jobs) {
          // 삭제와 재수집이 겹쳐도 원문 단위 잠금으로 처리 순서를 보장한다.
          await listingLock(client, job.exclusionKey);
          const exclusion = await client.query('SELECT key FROM app_setting WHERE key = $1', [job.exclusionKey]);
          if (exclusion.rowCount) { excluded += 1; continue; }
          await client.query(`INSERT INTO app_setting(key, value) VALUES ($1, $2::jsonb || jsonb_build_object(
              'firstSeenAt', clock_timestamp(), 'lastSeenAt', clock_timestamp(), 'updatedAt', clock_timestamp(), 'revision', 1, 'userState', 'NEW'))
            ON CONFLICT(key) DO UPDATE SET value = app_setting.value ||
              (EXCLUDED.value - 'firstSeenAt' - 'userState' - 'revision' - 'updatedAt') || jsonb_build_object(
              'revision', COALESCE((app_setting.value->>'revision')::int, 0) + CASE WHEN app_setting.value->>'contentHash' = EXCLUDED.value->>'contentHash' THEN 0 ELSE 1 END,
              'updatedAt', CASE WHEN app_setting.value->>'contentHash' = EXCLUDED.value->>'contentHash' THEN app_setting.value->'updatedAt' ELSE EXCLUDED.value->'updatedAt' END)`,
          [jobKey(job.id), JSON.stringify(job)]);
          stored += 1;
        }
        const report = { ...result.report, stored, excluded };
        const saved = { ...report, runKey: claim.runKey, pendingUrls: result.pendingUrls };
        await client.query(`UPDATE app_setting SET value = (value - 'token' - 'leaseUntil') || $2::jsonb ||
            CASE WHEN $3::boolean THEN jsonb_build_object('lastSuccessfulCollectionAt', clock_timestamp()) ELSE '{}'::jsonb END
          WHERE key = $1`, [sourceKey(claim.source), JSON.stringify(saved), result.report.state === 'SUCCESS']);
        await client.query(`INSERT INTO app_setting(key, value) VALUES ($1, $2::jsonb)
          ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
        [`recruitment:job-run:${claim.source}:${claim.runKey}`, JSON.stringify({ ...report, runKey: claim.runKey })]);
        await client.query('COMMIT');
        return report;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    async status() {
      const { rows } = await pool.query(`SELECT value - 'token' - 'pendingUrls' AS value FROM app_setting
        WHERE key LIKE 'recruitment:job-source:%' ORDER BY key`);
      return rows.map(row => row.value);
    },
    async list(limit = 50) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new CollectionError('INVALID_LIMIT');
      const page = await this.listPage({ limit });
      return page.items;
    },
    async listPage({ limit = 30, offset = 0, query = '', source = '', status = '' } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(offset) || offset < 0 ||
          typeof query !== 'string' || query.length > 150 || (source !== '' && !Object.hasOwn(SOURCES, source)) ||
          !['', 'OPEN', 'CLOSED', 'UNKNOWN'].includes(status)) throw new CollectionError('INVALID_QUERY');
      const { rows } = await pool.query(`WITH filtered AS (
        SELECT j.key, (j.value - 'description') || jsonb_build_object('status', ${currentStatus}) AS value
        FROM app_setting j WHERE ${visibleJobs}
          AND ($1::text = '' OR strpos(lower(concat_ws(' ', j.value->>'title', j.value->>'company', j.value->>'locations')), lower($1)) > 0)
          AND ($2::text = '' OR j.value->>'source' = $2)
          AND ($3::text = '' OR ${currentStatus} = $3)
      ), page AS (SELECT * FROM filtered ORDER BY value->>'firstSeenAt' DESC, key LIMIT $4 OFFSET $5)
      SELECT (SELECT count(*)::int FROM filtered) AS total,
        COALESCE((SELECT jsonb_agg(value ORDER BY value->>'firstSeenAt' DESC, key) FROM page), '[]'::jsonb) AS items`,
      [query.trim(), source, status, limit, offset]);
      return { ...rows[0], limit, offset };
    },
    async get(id) {
      validateJobId(id);
      const { rows } = await pool.query(`SELECT j.value || jsonb_build_object('status', ${currentStatus}) AS value
        FROM app_setting j WHERE j.key = $1 AND ${visibleJobs}`, [jobKey(id)]);
      return rows[0]?.value ?? null;
    },
    async remove(id) {
      validateJobId(id);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // 원문 식별자는 요청 본문이 아니라 저장된 공고에서만 읽는다.
        const found = await client.query('SELECT value FROM app_setting WHERE key = $1', [jobKey(id)]);
        if (!found.rows.length) { await client.query('COMMIT'); return { deleted: 0 }; }
        const identity = listingIdentity(found.rows[0].value.source, found.rows[0].value.url);
        await listingLock(client, identity.exclusionKey);
        await client.query(`INSERT INTO app_setting(key, value) VALUES ($1,
          jsonb_build_object('source', $2::text, 'url', $3::text, 'deletedAt', clock_timestamp()))
          ON CONFLICT(key) DO NOTHING`, [identity.exclusionKey, identity.source, identity.url]);
        const deleted = await client.query(`DELETE FROM app_setting WHERE key LIKE 'recruitment:job:%'
          AND (key = $1 OR value->>'exclusionKey' = $2 OR (value->>'source' = $3 AND value->>'url' = $4))`,
        [jobKey(id), identity.exclusionKey, identity.source, identity.url]);
        await client.query('COMMIT');
        return { deleted: deleted.rowCount, source: identity.source, url: identity.url };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
}
