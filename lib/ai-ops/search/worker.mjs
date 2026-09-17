import { randomUUID } from "node:crypto";
import {
  retryPolicy,
  providerError,
  validateVector,
  EmbeddingError,
} from "./provider.mjs";
export async function claimJobs(pool, profileId, limit = 4, maxAttempts = 5) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 8)
    throw new Error("Invalid worker batch size");
  await pool.query(
    `UPDATE ai_ops_embedding_job SET status='FAILED',error_code='LEASE_EXHAUSTED',lease_token=NULL,lease_until=NULL
  WHERE profile_id=$1 AND status='PROCESSING' AND lease_until<now() AND attempts>=$2`,
    [profileId, maxAttempts],
  );
  const token = randomUUID();
  const { rows } = await pool.query(
    `WITH pending AS (
  SELECT j.profile_id,j.content_hash FROM ai_ops_embedding_job j
  WHERE j.profile_id=$1 AND j.attempts<$3 AND ((j.status='PENDING' AND j.available_at<=now()) OR (j.status='PROCESSING' AND j.lease_until<now()))
  AND EXISTS(SELECT 1 FROM ai_ops_document_embedding e JOIN ai_ops_search_document d ON d.id=e.document_id
    JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision
    WHERE e.profile_id=j.profile_id AND e.content_hash=j.content_hash AND d.embedding_enabled)
  ORDER BY j.available_at,j.content_hash FOR UPDATE OF j SKIP LOCKED LIMIT $2
 ) UPDATE ai_ops_embedding_job j SET status='PROCESSING',attempts=attempts+1,lease_token=$4,lease_until=now()+interval '2 minutes',error_code=NULL
 FROM pending p WHERE j.profile_id=p.profile_id AND j.content_hash=p.content_hash RETURNING j.*`,
    [profileId, limit, maxAttempts, token],
  );
  return rows;
}
export async function finishJob(pool, job, result, dimensions) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rowCount } = await c.query(
      `SELECT 1 FROM ai_ops_embedding_job WHERE profile_id=$1 AND content_hash=$2
   AND status='PROCESSING' AND lease_token=$3 AND lease_until>now() FOR UPDATE`,
      [job.profile_id, job.content_hash, job.lease_token],
    );
    if (!rowCount) {
      await c.query("COMMIT");
      return false;
    }
    if (result.ok) {
      validateVector(result.vector, dimensions);
      await c.query(
        `INSERT INTO ai_ops_embedding_vector(profile_id,content_hash,dimensions,embedding) VALUES($1,$2,$3,$4::vector)
    ON CONFLICT(profile_id,content_hash) DO UPDATE SET embedding=EXCLUDED.embedding,dimensions=EXCLUDED.dimensions`,
        [
          job.profile_id,
          job.content_hash,
          dimensions,
          JSON.stringify(result.vector),
        ],
      );
      await c.query(
        `UPDATE ai_ops_embedding_job SET status='SUCCESS',embedded_at=now(),lease_token=NULL,lease_until=NULL,error_code=NULL
    WHERE profile_id=$1 AND content_hash=$2`,
        [job.profile_id, job.content_hash],
      );
    } else {
      const error = providerError(result.error),
        retry = retryPolicy(error, job.attempts);
      await c.query(
        `UPDATE ai_ops_embedding_job SET status=$3,available_at=now()+$4*interval '1 second',error_code=$5,lease_token=NULL,lease_until=NULL
    WHERE profile_id=$1 AND content_hash=$2`,
        [
          job.profile_id,
          job.content_hash,
          retry.status,
          retry.delaySeconds,
          error.code,
        ],
      );
    }
    await c.query("COMMIT");
    return true;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function runEmbeddingBatch(pool, provider, limit = 4) {
  const ready = await pool.query(
    "SELECT to_regclass('ai_ops_embedding_vector') IS NOT NULL AS ready",
  );
  if (!ready.rows[0].ready) throw new EmbeddingError("VECTOR_NOT_READY", false);
  // A removed/rebuilt derived vector table can be repaired without touching sources.
  await pool.query(
    `UPDATE ai_ops_embedding_job j SET status='PENDING',attempts=0,available_at=now(),embedded_at=NULL
  WHERE profile_id=$1 AND status='SUCCESS' AND NOT EXISTS(SELECT 1 FROM ai_ops_embedding_vector v WHERE v.profile_id=j.profile_id AND v.content_hash=j.content_hash)`,
    [provider.config.id],
  );
  const jobs = await claimJobs(pool, provider.config.id, limit);
  if (!jobs.length) return { processed: 0, succeeded: 0, failed: 0 };
  let results;
  try {
    results = await provider.embed(
      jobs.map((j) => ({ content: j.content, title: j.title })),
      "DOCUMENT",
    );
  } catch (e) {
    results = jobs.map(() => ({ ok: false, error: providerError(e) }));
  }
  const counts = { processed: jobs.length, succeeded: 0, failed: 0 };
  for (let i = 0; i < jobs.length; i++) {
    let result = results?.[i] ?? {
      ok: false,
      error: new EmbeddingError("INVALID_RESPONSE", false),
    };
    if (result.ok)
      try {
        validateVector(result.vector, provider.config.dimensions);
      } catch (e) {
        result = { ok: false, error: e };
      }
    if (await finishJob(pool, jobs[i], result, provider.config.dimensions))
      counts[result.ok ? "succeeded" : "failed"]++;
  }
  return counts;
}
export async function retryFailed(pool, profileId) {
  const { rowCount } = await pool.query(
    `UPDATE ai_ops_embedding_job SET status='PENDING',attempts=0,available_at=now(),error_code=NULL
  WHERE profile_id=$1 AND status='FAILED'`,
    [profileId],
  );
  return rowCount;
}
