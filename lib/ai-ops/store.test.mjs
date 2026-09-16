import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { assertTestDatabase } from "../test-database.ts";
import {
  validateBatch,
  ingestBatch,
  queryOverview,
  querySession,
  searchMessages,
} from "./store.mjs";
const now = new Date().toISOString();
const batch = () => ({
  version: 1,
  device: { id: "test-device", name: "Test" },
  sessions: [
    {
      id: "test-session",
      source: "CODEX",
      externalId: "test-external",
      cwd: "/Users/test/uk/demo",
      title: "Test session",
      startedAt: now,
      lastActiveAt: now,
    },
  ],
  messages: [
    {
      id: "test-message",
      sessionId: "test-session",
      role: "USER",
      model: "test-model",
      occurredAt: now,
      body: "literal 100% prompt",
      chars: 19,
    },
  ],
  usage: [
    {
      id: "test-usage",
      sessionId: "test-session",
      model: "test-model",
      occurredAt: now,
      inputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      outputTokens: 10,
      reasoningTokens: null,
      totalTokens: 10,
    },
  ],
  sync: { roots: [], files: 1, errors: 0 },
});
test("strict batch validation rejects invalid source, unknown role, null counts and oversized bodies", () => {
  assert.doesNotThrow(() => validateBatch(batch()));
  for (const change of [
    (b) => (b.sessions[0].source = "UNKNOWN"),
    (b) => (b.messages[0].role = "SYSTEM"),
    (b) => (b.usage[0].inputTokens = -1),
    (b) => (b.messages[0].body = "x".repeat(200001)),
    (b) => (b.messages[0].model = undefined),
    (b) => (b.sync.errors = null),
  ]) {
    const b = batch();
    change(b);
    assert.throws(() => validateBatch(b));
  }
});
test("local DB: idempotence, ownership, retention, null totals, filters and message search", async (t) => {
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
  // Isolate all DDL and fixture writes inside a rollback-only transaction and private schema.
  try {
    await c.query("BEGIN");
    await c.query("CREATE SCHEMA ai_ops_store_test");
    await c.query("SET LOCAL search_path TO ai_ops_store_test");
    await c.query(
      await readFile(
        new URL(
          "../../prisma/migrations/20260916090000_ai_ops/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const db = {
      query: (...args) => c.query(...args),
      connect: async () => ({
        query: (sql, args) =>
          sql === "BEGIN"
            ? c.query("SAVEPOINT ingest")
            : sql === "COMMIT"
              ? c.query("RELEASE SAVEPOINT ingest")
              : sql === "ROLLBACK"
                ? c.query("ROLLBACK TO SAVEPOINT ingest")
                : c.query(sql, args),
        release() {},
      }),
    };
    assert.deepEqual(await ingestBatch(db, batch()), {
      ok: true,
      messages: 1,
      usage: 1,
    });
    assert.deepEqual(await ingestBatch(db, batch()), {
      ok: true,
      messages: 0,
      usage: 0,
    });
    let o = await queryOverview(db);
    assert.equal(o.summary.inputTokens, 0);
    assert.equal(o.summary.cacheReadTokens, null);
    assert.equal(o.summary.missingRecords, 1);
    assert.equal(o.summary.prompts, 1);
    assert.equal(
      (await queryOverview(db, { source: "CLAUDE_CODE" })).summary.records,
      0,
    );
    assert.equal(
      (await queryOverview(db, { model: "test-model" })).sessions.length,
      1,
    );
    const updated = batch();
    updated.usage[0].outputTokens = 20;
    updated.usage[0].totalTokens = 20;
    await ingestBatch(db, updated);
    await ingestBatch(db, batch());
    assert.equal((await queryOverview(db)).summary.outputTokens, 20);
    const titleless = batch();
    titleless.sessions[0].title = "";
    await ingestBatch(db, titleless);
    assert.equal(
      (await querySession(db, "test-session")).session.title,
      "Test session",
    );
    assert.equal(
      (await searchMessages(db, { query: "100%" })).messages.length,
      1,
    );
    assert.equal(
      (await searchMessages(db, { query: "100_", kind: "USER" })).messages
        .length,
      0,
    );
    const conflict = batch();
    conflict.device.id = "other-device";
    await assert.rejects(() => ingestBatch(db, conflict));
    const old = batch();
    old.messages[0].id = "old-message";
    old.messages[0].occurredAt = new Date(
      Date.now() - 100 * 86400000,
    ).toISOString();
    old.usage = [];
    await ingestBatch(db, old);
    await c.query(
      "INSERT INTO ai_ops_message(id,session_id,role,occurred_at,body,chars) VALUES('expired-year','test-session','USER',NOW()-INTERVAL '366 days','gone',4)",
    );
    await c.query(
      "INSERT INTO ai_ops_message(id,session_id,role,occurred_at,body,chars) VALUES('expired-body','test-session','ASSISTANT',NOW()-INTERVAL '91 days','remove body',11)",
    );
    await ingestBatch(db, { ...batch(), messages: [], usage: [] });
    assert.equal(
      (await c.query("SELECT id FROM ai_ops_message WHERE id='expired-year'"))
        .rowCount,
      0,
    );
    assert.equal(
      (await c.query("SELECT body FROM ai_ops_message WHERE id='expired-body'"))
        .rows[0].body,
      null,
    );
    await c.query("DELETE FROM ai_ops_message WHERE id='expired-body'");
    const detail = await querySession(db, "test-session");
    assert.equal(detail.messages[0].body, null);
    assert.equal(detail.messages[0].expired, true);
    assert.equal(
      (await searchMessages(db, { query: "literal" })).messages.length,
      1,
    );
    const first = await querySession(db, "test-session", { limit: 1 });
    assert.ok(first.nextCursor);
    assert.equal(
      (
        await querySession(db, "test-session", {
          limit: 1,
          cursor: first.nextCursor,
        })
      ).messages[0].id,
      "test-message",
    );
    const anchored = await querySession(db, "test-session", {
      messageId: "test-message",
    });
    assert.equal(anchored.messages[0].id, "test-message");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    assert.equal(
      (await queryOverview(db, { from: today, to: today })).summary.records,
      1,
    );
    const earlier = new Date(Date.now() - 2 * 86400000);
    const earlierDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(earlier);
    await c.query(
      "INSERT INTO ai_ops_message(id,session_id,role,model,occurred_at,body,chars) VALUES('prior-activity','test-session','ASSISTANT','message-only',$1,'prior response',14)",
      [earlier],
    );
    const prior = await queryOverview(db, {
      from: earlierDay,
      to: earlierDay,
      model: "message-only",
    });
    assert.equal(prior.sessions.length, 1);
    assert.equal(prior.summary.sessions, 1);
    assert.equal(prior.summary.messages, 1);
    assert.equal(prior.summary.promptChars, 0);
    assert.equal(prior.summary.responseChars, 14);
    assert.ok(prior.options.models.includes("message-only"));
    await c.query(
      "UPDATE ai_ops_session SET started_at=NOW()-INTERVAL '100 days',title='expired prompt title' WHERE id='test-session'",
    );
    assert.equal((await querySession(db, "test-session")).session.title, "");
    assert.equal((await queryOverview(db)).sessions[0].title, "");
    assert.equal(
      (await searchMessages(db, { query: "literal" })).messages[0].title,
      "",
    );
    await ingestBatch(db, {
      ...batch(),
      sessions: [],
      messages: [],
      usage: [],
    });
    assert.equal(
      (
        await c.query(
          "SELECT title FROM ai_ops_session WHERE id='test-session'",
        )
      ).rows[0].title,
      "",
    );
    await assert.rejects(() => queryOverview(db, { from: "2026-02-31" }));
  } finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
  }
});
