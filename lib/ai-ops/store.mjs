import pg from "pg";
import { redact } from "./redact.mjs";
import { validProvenance } from "./provenance.mjs";
import { searchExcerpt } from "./search/interpretation.mjs";
import { searchableMessageSql } from "./search-policy.mjs";
export const MAX_BATCH_BYTES = 8 * 1024 * 1024;
export class AiOpsInputError extends Error {}
const bad = () => {
  throw new AiOpsInputError("잘못된 AI 활동 요청입니다.");
};
const text = (v, max = 512) => {
  if (typeof v !== "string" || !v.length || v.length > max || v.includes("\0"))
    bad();
  return v;
};
const id = (v) => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(v)) bad();
  return v;
};
const date = (v) => {
  if (
    typeof v !== "string" ||
    !Number.isFinite(Date.parse(v)) ||
    Date.parse(v) > Date.now() + 86400000
  )
    bad();
  return new Date(v);
};
const count = (v) => {
  if (!Number.isSafeInteger(v) || v < 0) bad();
  return v;
};
const tokenKeys = [
  "inputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
];
const tokenCols = [
  "input_tokens",
  "cache_read_tokens",
  "cache_write_tokens",
  "output_tokens",
  "reasoning_tokens",
  "total_tokens",
];
export function createPool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
}
export function validateBatch(b) {
  if (
    !b ||
    b.version !== 1 ||
    Buffer.byteLength(JSON.stringify(b)) > MAX_BATCH_BYTES
  )
    bad();
  id(b.device?.id);
  text(b.device?.name, 200);
  for (const key of ["sessions", "messages", "usage"])
    if (!Array.isArray(b[key]) || b[key].length > 2000) bad();
  if (!b.sync || !Array.isArray(b.sync.roots) || b.sync.roots.length > 200)
    bad();
  b.sync.roots.forEach((x) => text(x, 4096));
  count(b.sync.files);
  count(b.sync.errors);
  for (const s of b.sessions) {
    id(s.id);
    text(s.externalId, 512);
    if (!["CODEX", "CLAUDE_CODE"].includes(s.source)) bad();
    text(s.cwd, 4096);
    if (
      typeof s.title !== "string" ||
      s.title.length > 1000 ||
      s.title.includes("\0")
    )
      bad();
    date(s.startedAt);
    date(s.lastActiveAt);
    if (Date.parse(s.lastActiveAt) < Date.parse(s.startedAt)) bad();
  }
  for (const m of b.messages) {
    id(m.id);
    id(m.sessionId);
    if (!["USER", "ASSISTANT"].includes(m.role)) bad();
    if (m.model !== null) text(m.model, 200);
    date(m.occurredAt);
    if (
      typeof m.body !== "string" ||
      m.body.length > 200000 ||
      m.body.includes("\0")
    )
      bad();
    count(m.chars);
    if (m.sourceMetadata !== undefined && !validProvenance(m.sourceMetadata)) bad();
  }
  for (const u of b.usage) {
    id(u.id);
    id(u.sessionId);
    if (u.model !== null) text(u.model, 200);
    date(u.occurredAt);
    for (const k of tokenKeys) if (u[k] !== null) count(u[k]);
  }
  return b;
}
export async function ingestBatch(pool, batch) {
  const b = validateBatch(batch),
    c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `ai-ops:${b.device.id}`,
    ]);
    await c.query(
      `INSERT INTO ai_ops_device(id,name,files,errors,root_count) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,root_count=EXCLUDED.root_count,files=EXCLUDED.files,errors=EXCLUDED.errors,last_sync_at=NOW()`,
      [
        b.device.id,
        redact(b.device.name),
        b.sync.files,
        b.sync.errors,
        b.sync.roots.length,
      ],
    );
    for (const s of b.sessions) {
      const r = await c.query(
        `INSERT INTO ai_ops_session(id,device_id,source,external_id,cwd,title,started_at,last_active_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET title=CASE WHEN EXCLUDED.title='' THEN ai_ops_session.title ELSE EXCLUDED.title END,cwd=EXCLUDED.cwd,started_at=LEAST(ai_ops_session.started_at,EXCLUDED.started_at),last_active_at=GREATEST(ai_ops_session.last_active_at,EXCLUDED.last_active_at) WHERE ai_ops_session.device_id=EXCLUDED.device_id AND ai_ops_session.source=EXCLUDED.source AND ai_ops_session.external_id=EXCLUDED.external_id RETURNING id`,
        [
          s.id,
          b.device.id,
          s.source,
          s.externalId,
          redact(s.cwd),
          redact(s.title),
          s.startedAt,
          s.lastActiveAt,
        ],
      );
      if (!r.rowCount) bad();
    }
    const refs = [
      ...new Set([...b.messages, ...b.usage].map((x) => x.sessionId)),
    ];
    if (refs.length) {
      const r = await c.query(
        "SELECT id FROM ai_ops_session WHERE device_id=$1 AND id=ANY($2::text[]) FOR UPDATE",
        [b.device.id, refs],
      );
      if (r.rowCount !== refs.length) bad();
    }
    let messages = 0,
      usage = 0;
    for (const m of b.messages) {
      const existing = await c.query(
        "SELECT session_id FROM ai_ops_message WHERE id=$1",
        [m.id],
      );
      if (existing.rowCount && existing.rows[0].session_id !== m.sessionId)
        bad();
      const r = await c.query(
        `INSERT INTO ai_ops_message(id,session_id,role,model,occurred_at,body,chars,source_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         ON CONFLICT(id) DO UPDATE SET body=COALESCE(ai_ops_message.body,EXCLUDED.body),
         source_metadata=CASE WHEN ai_ops_message.source_metadata='{}'::jsonb THEN EXCLUDED.source_metadata ELSE ai_ops_message.source_metadata END
         WHERE ai_ops_message.session_id=EXCLUDED.session_id AND (ai_ops_message.body IS NULL OR
           (ai_ops_message.source_metadata='{}'::jsonb AND EXCLUDED.source_metadata<>'{}'::jsonb))`,
        [
          m.id,
          m.sessionId,
          m.role,
          m.model,
          m.occurredAt,
          redact(m.body),
          m.chars,
          JSON.stringify(m.sourceMetadata ?? {}),
        ],
      );
      messages += r.rowCount;
      if (!r.rowCount) {
        const owner = await c.query(
          "SELECT session_id FROM ai_ops_message WHERE id=$1",
          [m.id],
        );
        if (owner.rowCount && owner.rows[0].session_id !== m.sessionId) bad();
      }
    }
    for (const u of b.usage) {
      const existing = await c.query(
        "SELECT session_id FROM ai_ops_usage WHERE id=$1",
        [u.id],
      );
      if (existing.rowCount && existing.rows[0].session_id !== u.sessionId)
        bad();
      const r = await c.query(
        `INSERT INTO ai_ops_usage(id,session_id,model,occurred_at,${tokenCols.join(",")}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET ${tokenCols.map((col) => `${col}=GREATEST(ai_ops_usage.${col},EXCLUDED.${col})`).join(",")} WHERE ai_ops_usage.session_id=EXCLUDED.session_id AND (${tokenCols.map((col) => `(EXCLUDED.${col} IS NOT NULL AND (ai_ops_usage.${col} IS NULL OR EXCLUDED.${col}>ai_ops_usage.${col}))`).join(" OR ")})`,
        [
          u.id,
          u.sessionId,
          u.model,
          u.occurredAt,
          ...tokenKeys.map((k) => u[k]),
        ],
      );
      usage += r.rowCount;
      if (!r.rowCount) {
        const owner = await c.query(
          "SELECT session_id FROM ai_ops_usage WHERE id=$1",
          [u.id],
        );
        if (owner.rowCount && owner.rows[0].session_id !== u.sessionId) bad();
      }
    }
    for (const sessionId of refs) {
      await c.query(
        `UPDATE ai_ops_session SET last_active_at=GREATEST(last_active_at,COALESCE((SELECT MAX(occurred_at) FROM ai_ops_message WHERE session_id=$1),last_active_at),COALESCE((SELECT MAX(occurred_at) FROM ai_ops_usage WHERE session_id=$1),last_active_at)) WHERE id=$1`,
        [sessionId],
      );
    }
    await c.query("COMMIT");
    return { ok: true, messages, usage };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export function filters(p = {}, alias = "s", time = "s.last_active_at") {
  const values = [],
    where = ["TRUE"];
  const add = (sql, v) => {
    values.push(v);
    where.push(sql.replace("?", `$${values.length}`));
  };
  for (const key of ["from", "to"])
    if (p[key]) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(p[key]) ||
        !Number.isFinite(Date.parse(p[key])) ||
        new Date(p[key]).toISOString().slice(0, 10) !== p[key]
      )
        bad();
      add(
        `${time}${key === "from" ? ">=" : "<"}?::date AT TIME ZONE 'Asia/Seoul'${key === "to" ? " + INTERVAL '1 day'" : ""}`,
        p[key],
      );
    }
  if (p.from && p.to && p.from > p.to) bad();
  if (p.source) {
    if (!["CODEX", "CLAUDE_CODE"].includes(p.source)) bad();
    add(`${alias}.source=?`, p.source);
  }
  if (p.device) add(`${alias}.device_id=?`, id(p.device));
  if (p.model) {
    text(p.model, 200);
    add(
      time.startsWith("s.")
        ? `EXISTS(SELECT 1 FROM ai_ops_usage mu WHERE mu.session_id=s.id AND mu.model=?)`
        : `${time.split(".")[0]}.model=?`,
      p.model,
    );
  }
  return { values, where, add };
}
export function page(p) {
  const n = p.limit === undefined ? 50 : Number(p.limit);
  if (!Number.isInteger(n) || n < 1 || n > 100) bad();
  return n;
}
function cursor(v) {
  if (!v) return null;
  try {
    const x = JSON.parse(Buffer.from(v, "base64url").toString());
    date(x[0]);
    id(x[1]);
    return x;
  } catch {
    bad();
  }
}
function paginated(rows, limit, time) {
  const more = rows.length > limit;
  rows = rows.slice(0, limit);
  const last = rows.at(-1);
  return {
    rows,
    nextCursor: more
      ? Buffer.from(JSON.stringify([last[time], last.id])).toString("base64url")
      : null,
  };
}
const sessionSelect = `s.id,s.device_id AS "deviceId",d.name AS "deviceName",s.source,s.external_id AS "externalId",s.cwd,s.title AS title,s.started_at AS "startedAt",s.last_active_at AS "lastActiveAt"`;
const messageSelect = `m.id,m.session_id AS "sessionId",m.role,m.model,m.occurred_at AS "occurredAt",m.body AS body,(m.body IS NULL) AS expired,m.chars`;
const aggregates = tokenCols
  .map((c, i) => `SUM(u.${c})::float8 AS "${tokenKeys[i]}"`)
  .concat([
    "COUNT(*)::int AS records",
    `COUNT(*) FILTER(WHERE ${tokenCols.map((c) => `u.${c} IS NULL`).join(" OR ")})::int AS "missingRecords"`,
  ])
  .join(",");
export async function queryOverview(pool, p = {}) {
  const mf = filters(p, "s", "m.occurred_at"),
    uf = filters(p, "s", "u.occurred_at");
  // Both event filters bind identical parameters in the same order.
  const f = {
    values: mf.values,
    where: [
      `(EXISTS(SELECT 1 FROM ai_ops_message m WHERE m.session_id=s.id AND ${mf.where.join(" AND ")}) OR EXISTS(SELECT 1 FROM ai_ops_usage u WHERE u.session_id=s.id AND ${uf.where.join(" AND ")}))`,
    ],
  };
  const limit = page(p),
    v = [...f.values],
    w = [...f.where],
    cur = cursor(p.cursor);
  if (cur) {
    v.push(...cur);
    w.push(
      `(s.last_active_at,s.id)<($${v.length - 1}::timestamptz,$${v.length})`,
    );
  }
  v.push(limit + 1);
  const sessions = await pool.query(
    `SELECT ${sessionSelect} FROM ai_ops_session s JOIN ai_ops_device d ON d.id=s.device_id WHERE ${w.join(" AND ")} ORDER BY s.last_active_at DESC,s.id DESC LIMIT $${v.length}`,
    v,
  );
  const sc = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ai_ops_session s WHERE ${f.where.join(" AND ")}`,
    f.values,
  );
  const base = `FROM ai_ops_usage u JOIN ai_ops_session s ON s.id=u.session_id WHERE ${uf.where.join(" AND ")}`;
  const totals = await pool.query(`SELECT ${aggregates} ${base}`, uf.values);
  const byModel = await pool.query(
    `SELECT u.model,${aggregates} ${base} GROUP BY u.model ORDER BY SUM(u.total_tokens) DESC NULLS LAST`,
    uf.values,
  );
  const byDay = await pool.query(
    `SELECT TO_CHAR(u.occurred_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day,${aggregates} ${base} GROUP BY day ORDER BY day`,
    uf.values,
  );
  const mc = await pool.query(
    `SELECT COUNT(*)::int AS count,COUNT(*) FILTER(WHERE m.role='USER')::int AS prompts,COUNT(*) FILTER(WHERE m.role='ASSISTANT')::int AS responses,COALESCE(SUM(m.chars) FILTER(WHERE m.role='USER'),0)::float8 AS "promptChars",COALESCE(SUM(m.chars) FILTER(WHERE m.role='ASSISTANT'),0)::float8 AS "responseChars" FROM ai_ops_message m JOIN ai_ops_session s ON s.id=m.session_id WHERE ${mf.where.join(" AND ")}`,
    mf.values,
  );
  const devices = await pool.query(
    `SELECT id,name,last_sync_at AS "lastSyncAt",root_count AS "rootCount",files,errors FROM ai_ops_device ORDER BY last_sync_at DESC`,
  );
  const models = await pool.query(
    `SELECT model FROM ai_ops_usage WHERE model IS NOT NULL UNION SELECT model FROM ai_ops_message WHERE model IS NOT NULL ORDER BY model`,
  );
  const pag = paginated(sessions.rows, limit, "lastActiveAt");
  return {
    summary: {
      ...totals.rows[0],
      sessions: sc.rows[0].count,
      messages: mc.rows[0].count,
      prompts: mc.rows[0].prompts,
      responses: mc.rows[0].responses,
      promptChars: mc.rows[0].promptChars,
      responseChars: mc.rows[0].responseChars,
    },
    sessions: pag.rows,
    nextCursor: pag.nextCursor,
    devices: devices.rows,
    options: {
      models: models.rows.map((x) => x.model),
      sources: ["CODEX", "CLAUDE_CODE"],
    },
    byModel: byModel.rows,
    byDay: byDay.rows,
  };
}
export async function querySession(pool, sessionId, p = {}) {
  id(sessionId);
  const limit = page(p),
    f = filters(p, "s", "m.occurred_at"),
    cur = cursor(p.cursor);
  const s = await pool.query(
    `SELECT ${sessionSelect} FROM ai_ops_session s JOIN ai_ops_device d ON d.id=s.device_id WHERE s.id=$1`,
    [sessionId],
  );
  if (!s.rowCount) return null;
  f.add("m.session_id=?", sessionId);
  if (p.messageId && !cur) {
    id(p.messageId);
    f.add(
      "(m.occurred_at,m.id)>=(SELECT occurred_at,id FROM ai_ops_message WHERE id=? AND session_id=m.session_id)",
      p.messageId,
    );
  }
  if (cur) {
    f.values.push(...cur);
    f.where.push(
      `(m.occurred_at,m.id)>($${f.values.length - 1}::timestamptz,$${f.values.length})`,
    );
  }
  f.values.push(limit + 1);
  const r = await pool.query(
    `SELECT ${messageSelect} FROM ai_ops_message m JOIN ai_ops_session s ON s.id=m.session_id WHERE ${f.where.join(" AND ")} ORDER BY m.occurred_at,m.id LIMIT $${f.values.length}`,
    f.values,
  );
  const pag = paginated(r.rows, limit, "occurredAt");
  return { session: s.rows[0], messages: pag.rows, nextCursor: pag.nextCursor };
}
export async function searchMessages(pool, p = {}) {
  text(p.query, 200);
  if (!p.query.trim() || (p.mode && !["literal", "keyword"].includes(p.mode)))
    bad();
  const keyword = p.mode === "keyword";
  const limit = page(p),
    f = filters(p, "s", "m.occurred_at"),
    cur = cursor(p.cursor);
  f.where.push(searchableMessageSql("m.body"));
  const rank = keyword
    ? "ts_rank_cd(to_tsvector('simple',coalesce(m.body,'')),websearch_to_tsquery('simple',$1))"
    : "0";
  if (keyword) {
    f.values.unshift(p.query);
    // Filters bind positional parameters; shift them after reserving the query parameter.
    f.where.splice(
      0,
      f.where.length,
      ...f.where.map((sql) =>
        sql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`),
      ),
    );
    f.where.push(
      "to_tsvector('simple',coalesce(m.body,'')) @@ websearch_to_tsquery('simple',$1)",
    );
  } else
    f.add(
      "m.body ILIKE ? ESCAPE '\\'",
      `%${p.query.replace(/[\\%_]/g, "\\$&")}%`,
    );
  if (p.kind) {
    if (!["USER", "ASSISTANT"].includes(p.kind)) bad();
    f.add("m.role=?", p.kind);
  }
  if (p.sessionId) f.add("m.session_id=?", id(p.sessionId));
  if (cur && keyword && (cur.length !== 3 || !Number.isFinite(cur[2]) || cur[2] < 0)) bad();
  const rows = [];
  let scanCursor = cur;
  // Interpretation can reject legacy candidates. Continue scanning so filtering cannot
  // truncate a page or hide later genuine matches. Public cursors use the last survivor.
  while (rows.length <= limit) {
    const values = [...f.values], where = [...f.where];
    if (scanCursor) {
      values.push(...scanCursor.slice(0, 2));
      where.push(keyword
        ? `(${rank},m.occurred_at,m.id)<(${Number(scanCursor[2])}::real,$${values.length - 1}::timestamptz,$${values.length})`
        : `(m.occurred_at,m.id)<($${values.length - 1}::timestamptz,$${values.length})`);
    }
    values.push(Math.max(100, limit + 1));
    const result = await pool.query(
      `SELECT ${messageSelect},m.source_metadata,m.occurred_at::text AS "cursorOccurredAt",${rank} AS rank,s.title,s.cwd,s.source,d.name AS "deviceName"
       FROM ai_ops_message m JOIN ai_ops_session s ON s.id=m.session_id JOIN ai_ops_device d ON d.id=s.device_id
       WHERE ${where.join(" AND ")} ORDER BY ${keyword ? "rank DESC," : ""}m.occurred_at DESC,m.id DESC LIMIT $${values.length}`, values);
    for (const row of result.rows) {
      const block = searchExcerpt(row, p.query);
      if (block) rows.push({ ...row, snippet: block.content });
      if (rows.length > limit) break;
    }
    if (rows.length > limit || result.rows.length < values.at(-1)) break;
    const last = result.rows.at(-1);
    scanCursor = [last.cursorOccurredAt, last.id, last.rank];
  }
  const pag = paginated(rows, limit, "cursorOccurredAt");
  if (keyword && pag.nextCursor) {
    const last = pag.rows.at(-1);
    pag.nextCursor = Buffer.from(
      JSON.stringify([last.cursorOccurredAt, last.id, last.rank]),
    ).toString("base64url");
  }
  return { messages: pag.rows, nextCursor: pag.nextCursor };
}
