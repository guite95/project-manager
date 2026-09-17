import { AiOpsInputError, filters, page, searchMessages } from "../store.mjs";
import {
  createEmbeddingProvider,
  embeddingConfig,
  validateVector,
} from "./provider.mjs";
import { reciprocalRankFusion } from "./ranking.mjs";
import { searchPolicy, bytePrefix } from "./chunks.mjs";
const messageFields = `m.id,m.session_id AS "sessionId",m.role,m.model,m.occurred_at AS "occurredAt",m.body,m.chars,false AS expired,
 s.title,s.cwd,s.source,dev.name AS "deviceName"`;
function messageFilters(p) {
  const f = filters(p, "s", "m.occurred_at");
  if (p.kind) {
    if (!["USER", "ASSISTANT"].includes(p.kind))
      throw new AiOpsInputError("잘못된 검색 대상입니다.");
    f.add("m.role=?", p.kind);
  }
  if (p.sessionId) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(p.sessionId))
      throw new AiOpsInputError("잘못된 세션입니다.");
    f.add("s.id=?", p.sessionId);
  }
  return f;
}
async function lexicalCandidates(pool, p) {
  const f = messageFilters(p);
  f.values.push(p.query);
  const q = `$${f.values.length}`;
  // OR lexemes keep precise technical terms useful within a natural-language question.
  const ts = `to_tsquery('simple',replace(plainto_tsquery('simple',${q})::text,' & ',' | '))`;
  f.values.push(`%${p.query.replace(/[\\%_]/g, "\\$&")}%`);
  const literal = `$${f.values.length}`;
  const { rows } = await pool.query(
    `SELECT ${messageFields},ts_rank_cd(to_tsvector('simple',coalesce(m.body,'')),${ts}) AS rank
  FROM ai_ops_message m JOIN ai_ops_session s ON s.id=m.session_id JOIN ai_ops_device dev ON dev.id=s.device_id
  WHERE ${f.where.join(" AND ")} AND (to_tsvector('simple',coalesce(m.body,'')) @@ ${ts} OR m.body ILIKE ${literal} ESCAPE '\\')
  ORDER BY rank DESC,m.occurred_at DESC,m.id LIMIT 100`,
    f.values,
  );
  return rows.map((r) => {
    const body = r.body ?? "",
      lower = body.toLowerCase();
    const positions = (p.query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
      .map((term) => lower.indexOf(term))
      .filter((n) => n >= 0);
    let start = Math.max(
      0,
      (positions.length ? Math.min(...positions) : 0) - 250,
    );
    if (start > 0 && /[\uDC00-\uDFFF]/.test(body[start])) start--;
    const snippet = bytePrefix(body.slice(start), 6000);
    return {
      ...r,
      importance: searchPolicy(r.role, body).importance,
      snippet,
      metadata: { start, end: start + snippet.length },
    };
  });
}
async function chunkLexicalCandidates(pool, p, sessionIds) {
  const f = messageFilters(p);
  f.values.push(p.query);
  const q = `$${f.values.length}`;
  const ts = `to_tsquery('simple',replace(plainto_tsquery('simple',${q})::text,' & ',' | '))`;
  let scope = "";
  if (sessionIds?.length) {
    f.values.push(sessionIds);
    scope = `AND s.id=ANY($${f.values.length}::text[])`;
  }
  const { rows } = await pool.query(
    `SELECT ${messageFields},d.id AS "documentId",d.content AS snippet,d.metadata,d.importance,
  ts_rank_cd(d.search_vector,${ts}) AS rank FROM ai_ops_search_document d
  JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision
  JOIN ai_ops_message m ON m.id=d.message_id JOIN ai_ops_device dev ON dev.id=s.device_id
  WHERE d.kind='CHUNK' AND d.searchable AND d.search_vector @@ ${ts} AND ${f.where.join(" AND ")} ${scope}
  ORDER BY rank DESC,d.id LIMIT 100`,
    f.values,
  );
  return rows;
}
async function vectorCandidates(pool, p, config, vector, summary, sessionIds) {
  const f = messageFilters(p);
  const where = summary
    ? `EXISTS(SELECT 1 FROM ai_ops_message m WHERE m.session_id=s.id AND ${f.where.join(" AND ")})`
    : f.where.join(" AND ");
  const args = [
    ...f.values,
    config.id,
    JSON.stringify(vector),
    config.dimensions,
  ];
  const profile = `$${args.length - 2}`,
    query = `$${args.length - 1}`,
    dimension = `$${args.length}`;
  let scope = "";
  if (sessionIds) {
    args.push(sessionIds);
    scope = `AND s.id=ANY($${args.length}::text[])`;
  }
  // 1536 uses the partial HNSW index. Other dimensions use exact cosine until evaluated.
  const distance =
    config.dimensions === 1536
      ? `v.embedding::vector(1536) <=> ${query}::vector(1536)`
      : `v.embedding <=> ${query}::vector`;
  const { rows } = await pool.query(
    `SELECT ${summary ? 's.id AS "sessionId",d.id' : `${messageFields},d.id AS "documentId",d.content AS snippet,d.metadata,d.importance`},${distance} AS distance
  FROM ai_ops_embedding_vector v JOIN ai_ops_embedding_job j ON j.profile_id=v.profile_id AND j.content_hash=v.content_hash AND j.status='SUCCESS'
  JOIN ai_ops_document_embedding e ON e.profile_id=v.profile_id AND e.content_hash=v.content_hash
  JOIN ai_ops_search_document d ON d.id=e.document_id AND d.content_hash=e.content_hash
  JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision
  ${summary ? "" : `JOIN ai_ops_message m ON m.id=d.message_id JOIN ai_ops_device dev ON dev.id=s.device_id`}
  WHERE v.profile_id=${profile} AND v.dimensions=${dimension} ${config.dimensions === 1536 ? "AND v.dimensions=1536" : ""}
  AND d.searchable AND d.embedding_enabled AND d.kind ${summary ? "IN ('SESSION_SUMMARY','TOPIC_SUMMARY')" : "= 'CHUNK'"}
  AND ${where} ${scope} ORDER BY ${distance} LIMIT ${summary ? 60 : 100}`,
    args,
  );
  return rows;
}
export async function retrieve(pool, p = {}, options = {}) {
  if (!p.mode || ["literal", "keyword"].includes(p.mode))
    return searchMessages(pool, p);
  if (
    p.mode !== "hybrid" ||
    typeof p.query !== "string" ||
    !p.query.trim() ||
    p.query.length > 200 ||
    p.query.includes("\0") ||
    p.cursor
  )
    throw new AiOpsInputError("잘못된 검색 요청입니다.");
  const limit = page(p),
    config = options.config ?? options.provider?.config ?? embeddingConfig();
  let lexical = await lexicalCandidates(pool, p);
  const {
    rows: [cap],
  } = await pool.query(
    "SELECT to_regclass('ai_ops_embedding_vector') IS NOT NULL AS ready",
  );
  let vectorRows = [],
    candidateSessions = [],
    fallbackReason = null;
  if (!cap.ready) fallbackReason = "VECTOR_NOT_READY";
  else {
    const {
      rows: [coverage],
    } = await pool.query(
      `SELECT count(*)::int AS count FROM ai_ops_document_embedding e
   JOIN ai_ops_search_document d ON d.id=e.document_id JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision
   JOIN ai_ops_embedding_job j ON j.profile_id=e.profile_id AND j.content_hash=e.content_hash AND j.status='SUCCESS'
   JOIN ai_ops_embedding_vector v ON v.profile_id=e.profile_id AND v.content_hash=e.content_hash
   WHERE e.profile_id=$1 AND d.embedding_enabled AND d.searchable`,
      [config.id],
    );
    if (!coverage.count) fallbackReason = "INDEX_NOT_READY";
    else
      try {
        const provider = options.provider ?? createEmbeddingProvider(config);
        if (provider.config.id !== config.id)
          throw new Error("Embedding profile mismatch");
        const [result] = await provider.embed([{ content: p.query }], "QUERY");
        if (!result?.ok) fallbackReason = "EMBEDDING_UNAVAILABLE";
        else {
          validateVector(result.vector, config.dimensions);
          const c = await pool.connect();
          try {
            await c.query("BEGIN");
            await c.query("SET LOCAL hnsw.ef_search=100");
            await c.query("SET LOCAL hnsw.iterative_scan='strict_order'");
            const summaries = await vectorCandidates(
              c,
              p,
              config,
              result.vector,
              true,
            );
            candidateSessions = [
              ...new Set(summaries.map((r) => r.sessionId)),
            ].slice(0, 12);
            // Global candidates preserve recall during partial summary/chunk backfills.
            const global = await vectorCandidates(
              c,
              p,
              config,
              result.vector,
              false,
            );
            const scoped = candidateSessions.length
              ? await vectorCandidates(
                  c,
                  p,
                  config,
                  result.vector,
                  false,
                  candidateSessions,
                )
              : [];
            vectorRows = [...scoped, ...global];
            lexical = [
              ...(await chunkLexicalCandidates(c, p, candidateSessions)),
              ...lexical,
            ];
            await c.query("COMMIT");
          } catch (e) {
            await c.query("ROLLBACK");
            throw e;
          } finally {
            c.release();
          }
        }
      } catch (error) {
        // Surface DB/SQL failures; only provider/config failures get a lexical fallback.
        if (error?.code && /^[0-9A-Z]{5}$/.test(error.code)) throw error;
        fallbackReason = "EMBEDDING_UNAVAILABLE";
      }
  }
  const messages = reciprocalRankFusion([vectorRows, lexical]).slice(0, limit);
  let remaining = 16000;
  const context = messages.flatMap((m) => {
    if (remaining <= 0) return [];
    const content = bytePrefix(
      m.snippet ?? m.body ?? "",
      Math.min(4000, remaining),
    );
    remaining -= Buffer.byteLength(content);
    return [
      {
        sessionId: m.sessionId,
        messageId: m.id,
        documentId: m.documentId ?? null,
        content,
        start: m.metadata?.start ?? 0,
        end:
          m.metadata?.start !== undefined
            ? m.metadata.start + content.length
            : content.length,
      },
    ];
  });
  return {
    messages,
    nextCursor: null,
    mode: vectorRows.length ? "hybrid" : "keyword",
    fallbackReason,
    candidateSessions,
    context,
    profileId: config.id,
  };
}
