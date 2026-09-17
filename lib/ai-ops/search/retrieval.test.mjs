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
