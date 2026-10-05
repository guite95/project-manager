import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { getRuntimeSecret } from '../server/runtime-secrets.mjs';
import { CollectionError, SOURCES } from './config.mjs';
import { IDENTITY_VERSION, listingIdentity, validateJobId, jobIdentityKeys, groupDuplicateJobs, recognizedJobUrl } from './identity.mjs';
import { collectionControl } from './control.mjs';
import { ELIGIBILITY_VERSION, evaluateJob, jobEligibility } from './eligibility.mjs';

const sourceKey = source => `recruitment:job-source:${source}`;
export const jobKey = id => `recruitment:job:${id}`;
const visibleJobs = `j.key LIKE 'recruitment:job:%' AND NOT EXISTS (
  SELECT 1 FROM app_setting e WHERE e.key LIKE 'recruitment:job-exclusion:%'
    AND (e.key = j.value->>'exclusionKey' OR (j.value->'identityKeys') ? e.key OR (j.value->'originUrls') ? (e.value->>'url') OR
      (e.value->>'source' = j.value->>'source' AND e.value->>'url' = j.value->>'url'))) `;
const currentStatus = `CASE WHEN NULLIF(j.value->>'deadline', '')::timestamptz <= now()
  THEN 'CLOSED' ELSE COALESCE(j.value->>'status', 'UNKNOWN') END`;
const listingLock = (client, key) => client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
const jobsWriteLock = client => listingLock(client, 'recruitment:job-write');

async function excludeConnected(client, seed) {
  const { rows } = await client.query("SELECT value - 'description' AS value FROM app_setting WHERE key LIKE 'recruitment:job:%'");
  const group = groupDuplicateJobs([seed, ...rows.map(row => row.value).filter(job => job.id !== seed.id)], {allPositions:true})[0];
  const jobs = [group, ...group.duplicates], identities = new Map();
  for (const job of jobs) {
    for (const identity of [listingIdentity(job.source,job.url), ...(job.originUrls ?? []).map(recognizedJobUrl).filter(Boolean)]) identities.set(identity.exclusionKey,identity);
  }
  for (const identity of identities.values()) await client.query(`INSERT INTO app_setting(key,value) VALUES ($1,
    jsonb_build_object('source',$2::text,'url',$3::text,'deletedAt',clock_timestamp(),'identityVersion',$4::text))
    ON CONFLICT(key) DO UPDATE SET value = app_setting.value || jsonb_build_object('identityVersion',$4::text)`,
  [identity.exclusionKey,identity.source,identity.url,IDENTITY_VERSION]);
  const deleted = await client.query('DELETE FROM app_setting WHERE key = ANY($1::text[])', [jobs.map(job => jobKey(job.id))]);
  return { deleted: deleted.rowCount, deletedIds: jobs.map(job => job.id) };
}

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
        const refresh = rows.length ? await client.query(`SELECT value->>'url' AS url FROM app_setting
          WHERE (key LIKE 'recruitment:job:%' OR key LIKE 'recruitment:job-exclusion:%') AND value->>'source' = $1
            AND (COALESCE(value->>'identityVersion','') <> $2 OR
              (key LIKE 'recruitment:job:%' AND COALESCE(value->'eligibility'->>'version','') <> $3))
          ORDER BY key LIMIT 300`, [source,IDENTITY_VERSION,ELIGIBILITY_VERSION]) : {rows:[]};
        await client.query('COMMIT');
        if (!rows.length) return null;
        return { source, runKey, token, pendingUrls: Array.isArray(rows[0].value.pendingUrls) ? rows[0].value.pendingUrls : [], refreshUrls: [...new Set(refresh.rows.map(row => row.url))] };
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
        // 서로 다른 수집원 저장과 삭제도 같은 잠금을 먼저 잡아 사본의 재생성을 막는다.
        await jobsWriteLock(client);
        const lock = await client.query(`SELECT key FROM app_setting WHERE key = $1
          AND value->>'token' = $2 AND value->>'state' = 'RUNNING'
          AND (value->>'leaseUntil')::numeric >= extract(epoch FROM clock_timestamp()) * 1000 FOR UPDATE`, [sourceKey(claim.source), claim.token]);
        if (lock.rowCount !== 1) throw new CollectionError('LEASE_LOST');
        let stored = 0, excluded = 0;
        const jobs = [...result.jobs, ...(result.rejectedJobs ?? [])].map(job => {
          if (job.source !== claim.source) throw new CollectionError('INVALID_JOB');
          validateJobId(job.id);
          return { ...job, ...listingIdentity(job.source, job.url), eligibility: evaluateJob(job),
            identityVersion: IDENTITY_VERSION, identityKeys: jobIdentityKeys(job) };
        }).sort((a, b) => a.exclusionKey.localeCompare(b.exclusionKey));
        for (const job of jobs) {
          // 삭제와 재수집이 겹쳐도 원문 단위 잠금으로 처리 순서를 보장한다.
          await listingLock(client, job.exclusionKey);
          const exclusion = await client.query('SELECT key FROM app_setting WHERE key = ANY($1::text[])', [job.identityKeys]);
          if (exclusion.rowCount) { await excludeConnected(client,job); excluded += 1; continue; }
          if (job.eligibility.decision !== 'INCLUDE') {
            // 필터 탈락한 신규 공고는 만들지 않고 이미 저장된 공고의 조건 변경만 반영한다.
            await client.query(`UPDATE app_setting SET value = value ||
              ($2::jsonb - 'firstSeenAt' - 'userState' - 'revision' - 'updatedAt') || jsonb_build_object(
                'lastSeenAt', clock_timestamp(),
                'revision', COALESCE((value->>'revision')::int, 0) + CASE WHEN value->>'contentHash' = $2::jsonb->>'contentHash' THEN 0 ELSE 1 END,
                'updatedAt', CASE WHEN value->>'contentHash' = $2::jsonb->>'contentHash' THEN value->'updatedAt' ELSE to_jsonb(clock_timestamp()) END)
              WHERE key = $1`, [jobKey(job.id), JSON.stringify(job)]);
            continue;
          }
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
      const { rows } = await pool.query(`
        SELECT j.key, (CASE WHEN j.value->'eligibility'->>'version' = $4
          THEN j.value - 'description' ELSE j.value END) || jsonb_build_object('status', ${currentStatus}) AS value
        FROM app_setting j WHERE ${visibleJobs}
          AND ($1::text = '' OR strpos(lower(concat_ws(' ', j.value->>'title', j.value->>'company', j.value->>'locations')), lower($1)) > 0)
          AND ($2::text = '' OR j.value->>'source' = $2)
          AND ($3::text = '' OR ${currentStatus} = $3)
          AND (COALESCE(j.value->'eligibility'->>'version', '') <> $4 OR j.value->'eligibility'->>'decision' = 'INCLUDE')
        ORDER BY j.value->>'firstSeenAt' DESC, j.key`, [query.trim(), source, status, ELIGIBILITY_VERSION]);
      // 기존 데이터도 DB 갱신/삭제 없이 먼저 필터링해야 페이지 수와 전체 건수가 맞는다.
      const selected = groupDuplicateJobs(rows.map(row => row.value).filter(job => jobEligibility(job).decision === 'INCLUDE'));
      const items = selected.slice(offset, offset + limit).map(value => {
        const { description: _description, duplicates, ...summary } = value;
        return { ...summary, duplicates: duplicates.map(({id,source,url}) => ({id,source,url})) };
      });
      return { items, total: selected.length, limit, offset };
    },
    async get(id) {
      validateJobId(id);
      const { rows } = await pool.query(`SELECT j.value || jsonb_build_object('status', ${currentStatus}) AS value
        FROM app_setting j WHERE j.key = $1 AND ${visibleJobs}`, [jobKey(id)]);
      const job = rows[0]?.value;
      return job && jobEligibility(job).decision === 'INCLUDE' ? job : null;
    },
    async remove(id) {
      validateJobId(id);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await jobsWriteLock(client);
        // 원문 식별자는 요청 본문이 아니라 저장된 공고에서만 읽는다.
        const found = await client.query('SELECT value FROM app_setting WHERE key = $1', [jobKey(id)]);
        if (!found.rows.length) { await client.query('COMMIT'); return { deleted: 0 }; }
        const identity = listingIdentity(found.rows[0].value.source, found.rows[0].value.url);
        await listingLock(client, identity.exclusionKey);
        const deleted = await excludeConnected(client,found.rows[0].value);
        await client.query('COMMIT');
        return { ...deleted, source: identity.source, url: identity.url };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
}
