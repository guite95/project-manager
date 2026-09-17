import test from "node:test";
import assert from "node:assert/strict";
import { reciprocalRankFusion, evaluateRanking } from "./ranking.mjs";
test("RRF rewards agreement without counting duplicate chunks twice", () => {
  const r = reciprocalRankFusion([
    [{ id: "a" }, { id: "b" }, { id: "b" }],
    [{ id: "b" }, { id: "c" }],
  ]);
  assert.equal(r[0].id, "b");
  assert.equal(r.filter((x) => x.id === "b").length, 1);
  assert.ok(r[0].score > r[1].score);
});
test("evaluation supports model-independent recall, MRR and graded nDCG", () => {
  const r = evaluateRanking(["b", "x", "a", "a"], { a: 2, b: 1 });
  assert.equal(r.recall5, 1);
  assert.equal(r.recall10, 1);
  assert.equal(r.mrr, 1);
  assert.ok(r.ndcg10 > 0 && r.ndcg10 < 1);
  assert.equal(evaluateRanking([], { a: 1 }).mrr, 0);
});

test('selection preserves semantic paraphrases, rejects unrelated top ranks, and groups without deleting originals', async()=>{
 const {selectResults}=await import('./ranking.mjs');
 const row=(id,body,distance,sessionId='s')=>({id,sessionId,role:'ASSISTANT',body,snippet:body,distance,occurredAt:'2026-09-16',metadata:{start:0}});
 const ranked=selectResults([[row('noise','<skill>SSH instructions</skill>',.01),row('unrelated','바나나 배송 기록',.7),row('answer','Host nginx를 서비스 gateway 앞에 배치합니다.',.2),row('repeat','Host nginx를 서비스 gateway 앞에 배치합니다.',.2)],[],[],[]], '서버 구조 변경',{limit:10,minCosine:.68});
 assert.equal(ranked.length,1);assert.equal(ranked[0].id,'answer');assert.equal(ranked[0].occurrences.length,2);
 assert.equal(selectResults([[row('wrong','전혀 관계없는 설명',.5)],[],[],[]],'달나라',{minCosine:.68}).length,0);
});
test('diversity is a preference, not a hard session cap or cross-session deduplication', async()=>{
 const {selectResults}=await import('./ranking.mjs');
 const rows=Array.from({length:5},(_,i)=>({id:`m${i}`,sessionId:i===4?'other':'same',role:'USER',body:`nginx 질문 ${i}`,snippet:`nginx 질문 ${i}`,distance:.2,metadata:{start:0}}));
 const r=selectResults([rows,[],[],[]],'nginx',{limit:10});
 assert.equal(r.length,5);assert.ok(r.findIndex(x=>x.sessionId==='other')<4);
});
