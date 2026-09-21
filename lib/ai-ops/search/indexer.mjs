import { assertEmbeddingsEnabled } from "./policy.mjs";
import { buildDocuments, CHUNK_VERSION } from "./chunks.mjs";
export async function ensureProfile(db, config) {
  await db.query(
    `INSERT INTO ai_ops_embedding_profile(id,provider,model,dimensions,version,input_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
    [
      config.id,
      config.provider,
      config.model,
      config.dimensions,
      config.version,
      config.inputVersion,
    ],
  );
}
export async function enqueueDocuments(db, profileId, sessionId) {
  assertEmbeddingsEnabled();
  await db.query(
    `INSERT INTO ai_ops_embedding_job(profile_id,content_hash,title,content)
  SELECT DISTINCT $1,d.content_hash,d.title,d.content FROM ai_ops_search_document d
  JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision
  WHERE d.embedding_enabled AND ($2::text IS NULL OR d.session_id=$2) ON CONFLICT DO NOTHING`,
    [profileId, sessionId ?? null],
  );
  await db.query(
    `INSERT INTO ai_ops_document_embedding(document_id,profile_id,content_hash)
  SELECT d.id,$1,d.content_hash FROM ai_ops_search_document d JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision
  WHERE d.embedding_enabled AND ($2::text IS NULL OR d.session_id=$2) ON CONFLICT DO NOTHING`,
    [profileId, sessionId ?? null],
  );
}
export async function indexSession(pool, sessionId, config) {
  assertEmbeddingsEnabled();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const {
      rows: [session],
    } = await c.query("SELECT * FROM ai_ops_session WHERE id=$1 FOR UPDATE", [
      sessionId,
    ]);
    if (!session) {
      await c.query("COMMIT");
      return false;
    }
    const {
      rows: [state],
    } = await c.query("SELECT * FROM ai_ops_search_state WHERE session_id=$1", [
      sessionId,
    ]);
    await ensureProfile(c, config);
    if (
      state?.indexed_revision !== session.search_revision ||
      state?.chunk_version !== CHUNK_VERSION
    ) {
      const { rows: messages } = await c.query(
        "SELECT * FROM ai_ops_message WHERE session_id=$1 ORDER BY occurred_at,id",
        [sessionId],
      );
      const docs = buildDocuments(session, messages);
      // Only derived references are replaced; successful content-addressed vectors survive.
      await c.query("DELETE FROM ai_ops_search_document WHERE session_id=$1", [
        sessionId,
      ]);
      for (const d of docs)
        await c.query(
          `INSERT INTO ai_ops_search_document(id,session_id,message_id,kind,chunk_index,chunk_version,source_revision,title,content,content_hash,chars,content_type,searchable,embedding_enabled,importance,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            d.id,
            d.sessionId,
            d.messageId,
            d.kind,
            d.index,
            d.chunkVersion,
            d.sourceRevision,
            d.title,
            d.content,
            d.contentHash,
            d.chars,
            d.contentType,
            d.searchable,
            d.embeddingEnabled,
            d.importance,
            JSON.stringify(d.metadata),
          ],
        );
      await c.query(
        `INSERT INTO ai_ops_search_state(session_id,indexed_revision,chunk_version) VALUES($1,$2,$3)
    ON CONFLICT(session_id) DO UPDATE SET indexed_revision=EXCLUDED.indexed_revision,chunk_version=EXCLUDED.chunk_version,indexed_at=now()`,
        [sessionId, session.search_revision, CHUNK_VERSION],
      );
    }
    await enqueueDocuments(c, config.id, sessionId);
    await c.query("COMMIT");
    return true;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const pendingSessionPredicate = `x.session_id IS NULL OR x.indexed_revision<>s.search_revision OR x.chunk_version<>$1
  OR EXISTS(SELECT 1 FROM ai_ops_search_document d WHERE d.session_id=s.id AND d.embedding_enabled
    AND NOT EXISTS(SELECT 1 FROM ai_ops_document_embedding e WHERE e.document_id=d.id AND e.profile_id=$2))`;
export async function indexPendingSessions(pool, config, limit = 20) {
  assertEmbeddingsEnabled();
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid indexing batch size");
  const { rows } = await pool.query(
    `SELECT s.id FROM ai_ops_session s LEFT JOIN ai_ops_search_state x ON x.session_id=s.id
  WHERE ${pendingSessionPredicate}
  ORDER BY s.last_active_at,s.id LIMIT $3`,
    [CHUNK_VERSION, config.id, limit],
  );
  for (const row of rows) await indexSession(pool, row.id, config);
  return rows.length;
}
export async function searchStatus(pool, profileId) {
  const {
    rows: [cap],
  } =
    await pool.query(`SELECT to_regclass('ai_ops_search_document') IS NOT NULL AS core,
  to_regclass('ai_ops_embedding_vector') IS NOT NULL AS vector,
  EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector') AS "vectorAvailable"`);
  if (!cap.core) return cap;
  const { rows: jobs } = await pool.query(
    `SELECT profile_id,status,count(*) FILTER(WHERE active)::int AS count,
     count(*) FILTER(WHERE NOT active)::int AS "inactiveCount" FROM (
      SELECT j.profile_id,j.status,EXISTS(SELECT 1 FROM ai_ops_document_embedding e
       JOIN ai_ops_search_document d ON d.id=e.document_id AND d.embedding_enabled
       JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision
       WHERE e.profile_id=j.profile_id AND e.content_hash=j.content_hash) AS active
      FROM ai_ops_embedding_job j
     ) q GROUP BY profile_id,status`,
  );
  const {
    rows: [counts],
  } = await pool.query(
    `SELECT (SELECT count(*)::int FROM ai_ops_search_document) documents,
  (SELECT count(*)::int FROM ai_ops_session s LEFT JOIN ai_ops_search_state x ON x.session_id=s.id
   WHERE ${pendingSessionPredicate}) AS "pendingSessions"`,
    [CHUNK_VERSION, profileId],
  );
  return { ...cap, ...counts, jobs };
}
