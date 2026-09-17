import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { assertTestDatabase } from "../../test-database.ts";
import { embeddingConfig } from "./provider.mjs";
import {
  indexPendingSessions,
  indexSession,
  searchStatus,
} from "./indexer.mjs";
import {
  claimJobs,
  finishJob,
  runEmbeddingBatch,
  retryFailed,
} from "./worker.mjs";
import { searchMessages, ingestBatch, querySession } from "../store.mjs";
import { retrieve } from "./retrieval.mjs";

async function installTestVector(t, c) {
  let sql = await readFile(
    new URL("../../../scripts/sql/ai-ops-vector.sql", import.meta.url),
    "utf8",
  );
  if (
    !(
      await c.query("SELECT 1 FROM pg_available_extensions WHERE name='vector'")
    ).rowCount
  ) {
    if (!process.env.AI_OPS_TEST_VECTOR_SQL) {
      t.skip("pgvector extension files unavailable");
      return false;
    }
    // Optional locally compiled official pgvector SQL; runs only in guarded rollback test DB.
    await c.query(await readFile(process.env.AI_OPS_TEST_VECTOR_SQL, "utf8"));
    sql = sql.replace("CREATE EXTENSION IF NOT EXISTS vector;", "");
  }
  await c.query(sql);
  return true;
}
async function fixture(t, fn) {
  if (!process.env.TEST_DATABASE_URL) {
    t.skip("TEST_DATABASE_URL unavailable");
    return;
  }
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 1,
  });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("CREATE SCHEMA ai_search_test");
    await c.query("SET LOCAL search_path TO ai_search_test,public");
    for (const name of ["20260916090000_ai_ops", "20260917090000_ai_search"])
      await c.query(
        await readFile(
          new URL(
            `../../../prisma/migrations/${name}/migration.sql`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
    const db = {
      query: (...a) => c.query(...a),
      connect: async () => ({
        query: (sql, a) =>
          c.query(
            sql === "BEGIN"
              ? "SAVEPOINT worker"
              : sql === "COMMIT"
                ? "RELEASE SAVEPOINT worker"
                : sql === "ROLLBACK"
                  ? "ROLLBACK TO SAVEPOINT worker"
                  : sql,
            a,
          ),
        release() {},
      }),
    };
    await c.query("INSERT INTO ai_ops_device(id,name) VALUES('d','fixture')");
    await c.query(
      "INSERT INTO ai_ops_session(id,device_id,source,external_id,cwd,title,started_at,last_active_at) VALUES('s','d','CODEX','s','/test','OCI',now(),now())",
    );
    await c.query(
      "INSERT INTO ai_ops_message(id,session_id,role,model,occurred_at,body,chars) VALUES('m','s','USER','model',now(),'nginx 호스트 프로세스 분리 100% literal',30)",
    );
    await fn(db, c);
  } finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
  }
}
test("local DB: notices are excluded before pagination and indexing while originals and quoted discussion survive", async (t) =>
  fixture(t, async (db, c) => {
    const notices = ["[Request interrupted by user]", "\n[Request interrupted by USER for tool use]\r\n"];
    for (const [i, body] of [...notices, "[Request interrupted by user] 메시지와 nginx 오류를 어떻게 해결하나요?"].entries())
      await c.query("INSERT INTO ai_ops_message(id,session_id,role,occurred_at,body,chars) VALUES($1,'s','USER',now()+interval '1 second' * $2,$3,$4)",
        [`notice${i}`, 3 - i, body, body.length]);
    for (const mode of ["literal", "keyword", "hybrid"]) {
      const result = await retrieve(db, { query: "interrupted", mode, limit: 1, source: "CODEX", kind: "USER" });
      assert.deepEqual(result.messages.map(m => m.id), ["notice2"]);
      assert.equal(result.nextCursor, null);
    }
    assert.equal((await querySession(db, "s")).messages.length, 4);
    const config = embeddingConfig({});
    await indexSession(db, "s", config);
    assert.equal((await c.query("SELECT 1 FROM ai_ops_search_document WHERE message_id IN ('notice0','notice1') AND (searchable OR embedding_enabled)")).rowCount, 0);
    assert.equal((await c.query("SELECT 1 FROM ai_ops_embedding_job WHERE content=ANY($1::text[])", [notices])).rowCount, 0);
    assert.equal((await c.query("SELECT 1 FROM ai_ops_search_document WHERE message_id='notice2' AND searchable AND embedding_enabled")).rowCount, 1);
    const before = (await c.query("SELECT count(*)::int n FROM ai_ops_embedding_job")).rows[0].n;
    await c.query("UPDATE ai_ops_search_state SET chunk_version='paragraph-1'");
    await indexPendingSessions(db, config);
    assert.equal((await c.query("SELECT count(*)::int n FROM ai_ops_embedding_job")).rows[0].n, before);
  }));

test("local DB: hybrid excludes legacy notice vectors before candidate limits", async (t) =>
  fixture(t, async (db, c) => {
    if (!(await installTestVector(t, c))) return;
    const config = embeddingConfig({});
    await c.query("INSERT INTO ai_ops_message(id,session_id,role,occurred_at,body,chars) VALUES('notice','s','USER',now(),'[Request interrupted by user]',29)");
    await indexSession(db, "s", config);
    // Simulate old derived documents during rollout, before backfill replaces them.
    await c.query("UPDATE ai_ops_search_document SET searchable=true,embedding_enabled=true,importance=1 WHERE message_id='notice'");
    await indexSession(db, "s", config);
    const provider = { config, embed: async inputs => inputs.map(() => ({ ok: true, vector: [1, ...Array(1535).fill(0)] })) };
    while ((await runEmbeddingBatch(db, provider, 8)).processed) {}
    const result = await retrieve(db, { query: "엔진엑스", mode: "hybrid", limit: 1 }, { config, provider });
    assert.equal(result.fallbackReason, null);
    assert.deepEqual(result.messages.map(m => m.id), ["m"]);
    assert.deepEqual(result.context.map(m => m.messageId), ["m"]);
  }));
test("local DB: resumable indexing, content reuse, revision invalidation and literal/FTS compatibility", async (t) =>
  fixture(t, async (db, c) => {
    const config = embeddingConfig({});
    assert.equal(await indexPendingSessions(db, config), 1);
    assert.equal(await indexPendingSessions(db, config), 0);
    const jobs = await c.query("SELECT * FROM ai_ops_embedding_job");
    assert.ok(jobs.rowCount > 0);
    await indexSession(db, "s", config);
    assert.equal(
      (await c.query("SELECT * FROM ai_ops_embedding_job")).rowCount,
      jobs.rowCount,
    );
    assert.equal(
      (await searchMessages(db, { query: "100%" })).messages.length,
      1,
    );
    assert.equal(
      (await searchMessages(db, { query: "호스트 nginx", mode: "keyword" }))
        .messages.length,
      1,
    );
    await c.query("UPDATE ai_ops_message SET body=body WHERE id='m'");
    assert.equal(await indexPendingSessions(db, config), 0);
    await c.query(
      "UPDATE ai_ops_message SET body='새로운 OCI 변경' WHERE id='m'",
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int AS n FROM ai_ops_search_document d JOIN ai_ops_session s ON s.id=d.session_id AND s.search_revision=d.source_revision",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(await indexPendingSessions(db, config), 1);
    const alt = embeddingConfig({ EMBEDDING_VERSION: "2" });
    assert.equal(await indexPendingSessions(db, alt), 1);
    assert.equal(
      (await c.query("SELECT count(*)::int AS n FROM ai_ops_message")).rows[0]
        .n,
      1,
    );
  }));
test("local DB: leases, retry exhaustion and manual replay preserve raw messages", async (t) =>
  fixture(t, async (db, c) => {
    const config = embeddingConfig({});
    await indexSession(db, "s", config);
    const [first] = await claimJobs(db, config.id, 1);
    assert.ok(first);
    const others = await claimJobs(db, config.id, 8);
    assert.ok(others.every((j) => j.content_hash !== first.content_hash));
    await c.query(
      "UPDATE ai_ops_embedding_job SET lease_until=now()-interval '1 second' WHERE content_hash=$1",
      [first.content_hash],
    );
    const [second] = await claimJobs(db, config.id, 1);
    assert.equal(second.content_hash, first.content_hash);
    assert.notEqual(second.lease_token, first.lease_token);
    assert.equal(
      await finishJob(db, first, { ok: false, error: { status: 403 } }, 1536),
      false,
    );
    await finishJob(db, second, { ok: false, error: { status: 403 } }, 1536);
    assert.equal(
      (
        await c.query(
          "SELECT status FROM ai_ops_embedding_job WHERE content_hash=$1",
          [second.content_hash],
        )
      ).rows[0].status,
      "FAILED",
    );
    assert.equal(await retryFailed(db, config.id), 1);
    await c.query(
      "UPDATE ai_ops_embedding_job SET status='PROCESSING',attempts=5,lease_until=now()-interval '1 second'",
    );
    assert.equal((await claimJobs(db, config.id, 4)).length, 0);
    assert.equal(
      (await c.query("SELECT count(*)::int AS n FROM ai_ops_message")).rows[0]
        .n,
      1,
    );
  }));
test("local DB: real pgvector persistence and partial API failure", async (t) =>
  fixture(t, async (db, c) => {
    if (!(await installTestVector(t, c))) return;
    const config = embeddingConfig({});
    await indexSession(db, "s", config);
    let calls = 0;
    const provider = {
      config,
      embed: async (inputs) =>
        inputs.map(() =>
          ++calls === 1
            ? { ok: false, error: { status: 429 } }
            : { ok: true, vector: [1, ...Array(1535).fill(0)] },
        ),
    };
    const result = await runEmbeddingBatch(db, provider);
    assert.equal(result.failed, 1);
    assert.ok(result.succeeded > 0);
    const n = (
      await c.query("SELECT count(*)::int AS n FROM ai_ops_embedding_vector")
    ).rows[0].n;
    assert.equal(n, result.succeeded);
    await indexSession(db, "s", config);
    await runEmbeddingBatch(db, provider);
    assert.equal(calls, result.processed);
    assert.equal(
      (
        await c.query(
          "SELECT vector_dims(embedding) AS dims FROM ai_ops_embedding_vector LIMIT 1",
        )
      ).rows[0].dims,
      1536,
    );
  }));

test("local DB: hybrid retrieval, source/model/date filters, fallback and stale exclusion", async (t) =>
  fixture(t, async (db, c) => {
    const config = embeddingConfig({});
    const lexical = await retrieve(db, {
      query: "호스트 nginx",
      mode: "hybrid",
    });
    assert.equal(lexical.fallbackReason, "VECTOR_NOT_READY");
    assert.equal(lexical.messages[0].id, "m");
    assert.equal(
      (
        await searchMessages(db, {
          query: "nginx",
          mode: "keyword",
          kind: "ASSISTANT",
        })
      ).messages.length,
      0,
    );
    if (!(await installTestVector(t, c))) return;
    await indexSession(db, "s", config);
    const provider = {
      config,
      embed: async (inputs) =>
        inputs.map(() => ({ ok: true, vector: [1, ...Array(1535).fill(0)] })),
    };
    await runEmbeddingBatch(db, provider);
    const result = await retrieve(
      db,
      { query: "서버 구조 변경", mode: "hybrid" },
      { config, provider },
    );
    assert.equal(result.fallbackReason, null);
    assert.equal(result.messages[0].id, "m");
    assert.deepEqual(result.candidateSessions, ["s"]);
    assert.equal(result.context[0].messageId, "m");
    assert.ok(result.context[0].content.includes("nginx"));
    for (const filter of [
      { source: "CLAUDE_CODE" },
      { model: "missing" },
      { kind: "ASSISTANT" },
      { from: "2099-01-01" },
      { device: "other" },
    ])
      assert.equal(
        (
          await retrieve(
            db,
            { query: "서버 구조 변경", mode: "hybrid", ...filter },
            { config, provider },
          )
        ).messages.length,
        0,
      );
    const alt = embeddingConfig({ EMBEDDING_VERSION: "other" });
    assert.equal(
      (
        await retrieve(
          db,
          { query: "서버 구조 변경", mode: "hybrid" },
          { config: alt, provider: { ...provider, config: alt } },
        )
      ).fallbackReason,
      "INDEX_NOT_READY",
    );
    const unavailable = {
      config,
      embed: async () => [{ ok: false, error: { status: 429 } }],
    };
    assert.equal(
      (
        await retrieve(
          db,
          { query: "nginx", mode: "hybrid" },
          { config, provider: unavailable },
        )
      ).fallbackReason,
      "EMBEDDING_UNAVAILABLE",
    );
    await c.query("UPDATE ai_ops_message SET body='다른 내용' WHERE id='m'");
    assert.equal(
      (
        await retrieve(
          db,
          { query: "서버 구조 변경", mode: "hybrid" },
          { config, provider },
        )
      ).messages.length,
      0,
    );
  }));
test("local DB: FTS ranked cursors and quoted/literal query compatibility", async (t) =>
  fixture(t, async (db, c) => {
    await c.query(
      "INSERT INTO ai_ops_message(id,session_id,role,model,occurred_at,body,chars) SELECT 'n',session_id,role,model,occurred_at,body,chars FROM ai_ops_message WHERE id='m'",
    );
    const first = await searchMessages(db, {
      query: "nginx",
      mode: "keyword",
      limit: 1,
    });
    assert.ok(first.nextCursor);
    const second = await searchMessages(db, {
      query: "nginx",
      mode: "keyword",
      limit: 1,
      cursor: first.nextCursor,
    });
    assert.notEqual(first.messages[0].id, second.messages[0].id);
    assert.equal(second.nextCursor, null);
    assert.equal(
      (
        await searchMessages(db, {
          query: '"호스트 프로세스"',
          mode: "keyword",
        })
      ).messages.length,
      2,
    );
    assert.equal(
      (await retrieve(db, { query: "100%", mode: "hybrid" })).messages.length,
      2,
    );
    await assert.rejects(() =>
      retrieve(db, { query: "nginx", mode: "hybrid", kind: "SYSTEM" }),
    );
  }));

test("local DB: status separates inactive jobs and pending profile backfill", async (t) =>
  fixture(t, async (db, c) => {
    const config = embeddingConfig({});
    await indexSession(db, "s", config);
    const alt = embeddingConfig({ EMBEDDING_VERSION: "next" });
    assert.equal((await searchStatus(db, alt.id)).pendingSessions, 1);
    await c.query(
      "UPDATE ai_ops_message SET body='changed source' WHERE id='m'",
    );
    const status = await searchStatus(db, config.id);
    assert.ok(status.jobs.every((j) => j.count === 0));
    assert.ok(status.jobs.some((j) => j.inactiveCount > 0));
  }));

test("local DB: provider outage cannot prevent raw message import and ACK", async (t) =>
  fixture(t, async (db, c) => {
    if (!(await installTestVector(t, c))) return;
    const config = embeddingConfig({});
    await indexSession(db, "s", config);
    const provider = {
      config,
      embed: async (inputs) =>
        inputs.map(() => ({ ok: false, error: { status: 503 } })),
    };
    const result = await runEmbeddingBatch(db, provider);
    assert.ok(result.failed > 0);
    const now = new Date().toISOString();
    const ack = await ingestBatch(db, {
      version: 1,
      device: { id: "d", name: "fixture" },
      sessions: [],
      messages: [
        {
          id: "new",
          sessionId: "s",
          role: "ASSISTANT",
          model: "model",
          occurredAt: now,
          body: "API 장애 중에도 원문은 저장",
          chars: 20,
        },
      ],
      usage: [],
      sync: { roots: [], files: 1, errors: 0 },
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.messages, 1);
    assert.equal(
      (await searchMessages(db, { query: "원문은" })).messages[0].id,
      "new",
    );
  }));
