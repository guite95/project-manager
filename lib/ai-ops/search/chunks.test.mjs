import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkMessage,
  buildDocuments,
  contentHash,
  searchPolicy,
} from "./chunks.mjs";

test("chunks preserve source offsets, Unicode and full content across long code and prose", () => {
  const body =
    "OCI 서버 구조 변경 설명입니다.\n\n" +
    "설명 😀 nginx proxy.\n".repeat(200) +
    "```ts\n" +
    "const x = 1;\n".repeat(200) +
    "```";
  const chunks = chunkMessage({ id: "m", role: "ASSISTANT", body });
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((c) => c.content).join(""), body);
  for (const c of chunks) {
    assert.equal(body.slice(c.start, c.end), c.content);
    assert.ok(Buffer.byteLength(c.content) <= 6000);
    assert.ok(!c.content.includes("\uFFFD"));
  }
});
test("policy excludes machine noise and metadata, but preserves useful error evidence", () => {
  for (const type of ["USAGE", "CACHE", "SYSTEM", "TOOL_CALL"])
    assert.equal(searchPolicy(type, "hello").embeddingEnabled, false);
  assert.equal(
    searchPolicy("COMMAND_OUTPUT", "npm http fetch GET 200\n".repeat(100))
      .embeddingEnabled,
    false,
  );
  assert.equal(
    searchPolicy("TOOL_RESULT", "Error: connection refused to PostgreSQL")
      .embeddingEnabled,
    true,
  );
  assert.equal(searchPolicy("USER", "OCI 서버 구조를 바꿔줘").importance, 1);
});
test("documents keep long sessions covered with topic summaries and stable content hashes", () => {
  const session = { id: "s", title: "OCI", search_revision: "1" };
  const messages = Array.from({ length: 50 }, (_, i) => ({
    id: `m${i}`,
    role: "USER",
    body: `질문 ${i}: nginx 구조 변경`,
    occurred_at: new Date(),
  }));
  const docs = buildDocuments(session, messages);
  assert.equal(docs.filter((d) => d.kind === "CHUNK").length, 50);
  assert.ok(docs.filter((d) => d.kind === "TOPIC_SUMMARY").length > 1);
  assert.ok(docs.some((d) => d.kind === "SESSION_SUMMARY"));
  assert.ok(
    docs
      .filter((d) => d.kind === "TOPIC_SUMMARY")
      .at(-1)
      .content.includes("질문 49"),
  );
  assert.equal(contentHash("title", "body"), contentHash("title", "body"));
  assert.notEqual(
    contentHash("title", "body"),
    contentHash("new title", "body"),
  );
  assert.deepEqual(
    buildDocuments(session, messages).map((d) => d.id),
    docs.map((d) => d.id),
  );
});
