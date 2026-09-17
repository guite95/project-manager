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
test("standalone interruption notices stay out of chunks and summaries without hiding real discussion", () => {
  const notices = ["[Request interrupted by user]", " \n[Request interrupted by USER for tool use]\r\n"];
  for (const body of notices) {
    assert.equal(searchPolicy("USER", body).searchable, false);
    assert.equal(searchPolicy("ASSISTANT", body).embeddingEnabled, false);
  }
  const discussion = "[Request interrupted by user] 메시지가 뜰 때 nginx 요청을 다시 보내면 되나요?";
  assert.equal(searchPolicy("USER", discussion).searchable, true);
  assert.equal(searchPolicy("USER", discussion).embeddingEnabled, true);
  const docs = buildDocuments({ id: "s", title: "nginx", search_revision: "1" }, [
    ...notices.map((body, i) => ({ id: `notice${i}`, role: "USER", body })),
    { id: "real", role: "ASSISTANT", body: "nginx 호스트 프로세스 분리" },
  ]);
  assert.equal(docs.filter(d => d.kind === "CHUNK").length, 3);
  assert.equal(docs.filter(d => d.kind === "CHUNK" && d.embeddingEnabled).length, 1);
  for (const summary of docs.filter(d => d.kind !== "CHUNK")) {
    assert.ok(summary.content.includes("nginx 호스트 프로세스 분리"));
    assert.ok(!summary.content.toLowerCase().includes("request interrupted"));
  }
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

test('conversation chunks use a local question and retain citations independently of session renames',()=>{
 const messages=[{id:'q',role:'USER',body:'nginx를 호스트로 이동하려면 어떻게 하나요?'},{id:'a',role:'ASSISTANT',body:'포트 80과 443을 호스트 nginx에 연결합니다.'}];
 const first=buildDocuments({id:'s',title:'unrelated title',search_revision:'1'},messages);
 const second=buildDocuments({id:'s',title:'another unrelated title',search_revision:'2'},messages);
 assert.deepEqual(first.map(d=>d.contentHash),second.map(d=>d.contentHash));
 const answer=first.find(d=>d.messageId==='a');
 assert.equal(answer.title,messages[0].body);
 assert.deepEqual(answer.metadata.contextSources,[{messageId:'q',role:'USER',start:0,end:messages[0].body.length}]);
 assert.equal(answer.content,messages[1].body);
 assert.equal(answer.metadata.interpretation.version,'content-2');
});


test('local chunk policy detects an empty report section inside a longer genuine prompt',()=>{
 const body='nginx 코드와 설계 요구사항입니다.\n'.repeat(220)+'\n\n'+('Implementation:\nRequests:\nCache:\nResolve:\nDuration:\nResult:\n').repeat(120);
 const chunks=chunkMessage({role:'USER',body});
 assert.ok(chunks.some(c=>c.contentType==='TEMPLATE'&&c.importance<.6));
 assert.ok(chunks.some(c=>c.importance>=.6));
 assert.equal(chunks.map(c=>c.content).join(''),body);
});
