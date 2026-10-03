import { randomUUID } from 'node:crypto';
import { CollectionError } from './config.mjs';

export const MANUAL_KEY = 'recruitment:job-manual';
export const WORKER_KEY = 'recruitment:job-worker';
const publicValue = value => {
  if (!value) return null;
  const { token: _token, leaseUntil: _lease, ...visible } = value;
  return visible;
};

/** 웹은 요청만 저장하고, 외부 수집은 watch 프로세스가 수행한다. */
export function collectionControl(pool) {
  return {
    async requestManual() {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [MANUAL_KEY]);
        const current = await client.query('SELECT value FROM app_setting WHERE key = $1 FOR UPDATE', [MANUAL_KEY]);
        const value = current.rows[0]?.value;
        if (value && ['QUEUED', 'RUNNING'].includes(value.state)) {
          await client.query('COMMIT');
          return { created: false, request: publicValue(value) };
        }
        const { rows } = await client.query(`INSERT INTO app_setting(key, value) VALUES ($1,
          jsonb_build_object('runKey', $2::text, 'state', 'QUEUED', 'requestedAt', clock_timestamp(), 'attempts', 0, 'reports', '[]'::jsonb))
          ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value RETURNING value`, [MANUAL_KEY, `manual-${randomUUID()}`]);
        await client.query('COMMIT');
        return { created: true, request: publicValue(rows[0].value) };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
    async claimManual() {
      // 중단된 요청은 같은 회차로 재개한다. 반복 중단은 무한 재시작하지 않는다.
      await pool.query(`UPDATE app_setting SET value = (value - 'token' - 'leaseUntil') || jsonb_build_object(
        'state', 'FAILED', 'error', 'RETRY_EXHAUSTED', 'finishedAt', clock_timestamp())
        WHERE key = $1 AND value->>'state' = 'RUNNING' AND (value->>'leaseUntil')::numeric < extract(epoch FROM clock_timestamp()) * 1000
          AND COALESCE((value->>'attempts')::int, 0) >= 3`, [MANUAL_KEY]);
      const { rows } = await pool.query(`UPDATE app_setting SET value = value || jsonb_build_object(
        'state', 'RUNNING', 'token', $2::text, 'leaseUntil', extract(epoch FROM clock_timestamp()) * 1000 + 300000,
        'startedAt', COALESCE(value->'startedAt', to_jsonb(clock_timestamp())),
        'attempts', CASE WHEN value->>'state' = 'RUNNING' THEN COALESCE((value->>'attempts')::int, 0) + 1 ELSE GREATEST(COALESCE((value->>'attempts')::int, 0), 1) END)
        WHERE key = $1 AND (value->>'state' = 'QUEUED' OR
          (value->>'state' = 'RUNNING' AND (value->>'leaseUntil')::numeric < extract(epoch FROM clock_timestamp()) * 1000))
        RETURNING value`, [MANUAL_KEY, randomUUID()]);
      return rows[0]?.value ?? null;
    },
    async heartbeatManual(claim) {
      let result;
      try { result = await pool.query(`UPDATE app_setting SET value = value || jsonb_build_object(
        'leaseUntil', extract(epoch FROM clock_timestamp()) * 1000 + 300000)
        WHERE key = $1 AND value->>'runKey' = $2 AND value->>'token' = $3 AND value->>'state' = 'RUNNING'
          AND (value->>'leaseUntil')::numeric >= extract(epoch FROM clock_timestamp()) * 1000`, [MANUAL_KEY, claim.runKey, claim.token]); }
      catch { throw new CollectionError('LEASE_LOST'); }
      if (result.rowCount !== 1) throw new CollectionError('LEASE_LOST');
    },
    async finishManual(claim, { state, reports = [], error }) {
      if (!['QUEUED', 'SUCCESS', 'PARTIAL', 'FAILED'].includes(state)) throw new CollectionError('INVALID_RUN');
      const { rows } = await pool.query(`UPDATE app_setting SET value = (value - 'token' - 'leaseUntil' - 'error') || $4::jsonb ||
        CASE WHEN $5::boolean THEN '{}'::jsonb ELSE jsonb_build_object('finishedAt', clock_timestamp()) END
        WHERE key = $1 AND value->>'runKey' = $2 AND value->>'token' = $3 AND value->>'state' = 'RUNNING'
          AND (value->>'leaseUntil')::numeric >= extract(epoch FROM clock_timestamp()) * 1000 RETURNING value`,
      [MANUAL_KEY, claim.runKey, claim.token, JSON.stringify({ state, reports, ...(error ? { error } : {}) }), state === 'QUEUED']);
      if (!rows.length) throw new CollectionError('LEASE_LOST');
      return publicValue(rows[0].value);
    },
    async touchWorker() {
      await pool.query(`INSERT INTO app_setting(key, value) VALUES ($1, jsonb_build_object('lastSeenAt', clock_timestamp()))
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`, [WORKER_KEY]);
    },
    async controlStatus() {
      const { rows } = await pool.query(`SELECT
        (SELECT value - 'token' - 'leaseUntil' FROM app_setting WHERE key = $1) AS request,
        (SELECT value->>'lastSeenAt' FROM app_setting WHERE key = $2) AS "workerSeenAt",
        COALESCE((SELECT (value->>'lastSeenAt')::timestamptz > now() - interval '90 seconds' FROM app_setting WHERE key = $2), false) AS "workerOnline"`,
      [MANUAL_KEY, WORKER_KEY]);
      return rows[0];
    },
  };
}
