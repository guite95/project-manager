import assert from "node:assert/strict";
import test from "node:test";

const helpers = await import("./sidebar-order.ts").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const defaultOrder = ["common", "tns", "focus-ai", "jespro"];

test("기본 순서는 기존 제스프로 위치를 유지하면서 외부 프로젝트도 포함한다", () => {
  assert.equal(typeof helpers.defaultSidebarOrder, "function");
  assert.deepEqual(
    helpers.defaultSidebarOrder(["common", "tns", "jespro"], ["focus-ai"]),
    defaultOrder,
  );
});

test("저장된 순서를 유지하고 새 프로젝트를 추가하며 삭제된 항목과 중복은 버린다", () => {
  assert.equal(typeof helpers.normalizeSidebarOrder, "function");
  assert.deepEqual(
    helpers.normalizeSidebarOrder([...defaultOrder, "new"], ["jespro", "removed", "tns", "tns", 4]),
    ["jespro", "tns", "common", "focus-ai", "new"],
  );
});

test("손상된 설정은 기본 순서로 복구한다", () => {
  assert.equal(typeof helpers.normalizeSidebarOrder, "function");
  for (const saved of [null, {}, "tns", undefined]) {
    assert.deepEqual(helpers.normalizeSidebarOrder(defaultOrder, saved), defaultOrder);
  }
});

test("외부 프로젝트와 DB 프로젝트 사이를 양방향으로 옮긴다", () => {
  assert.equal(typeof helpers.moveSidebarProject, "function");
  assert.deepEqual(helpers.moveSidebarProject(defaultOrder, "jespro", "common", "before"),
    ["jespro", "common", "tns", "focus-ai"]);
  assert.deepEqual(helpers.moveSidebarProject(defaultOrder, "common", "focus-ai", "after"),
    ["tns", "focus-ai", "common", "jespro"]);
  assert.deepEqual(defaultOrder, ["common", "tns", "focus-ai", "jespro"]);
});

test("자기 자신이나 알 수 없는 프로젝트로 드롭하면 순서를 바꾸지 않는다", () => {
  assert.equal(typeof helpers.moveSidebarProject, "function");
  assert.equal(helpers.moveSidebarProject(defaultOrder, "tns", "tns", "before"), defaultOrder);
  assert.equal(helpers.moveSidebarProject(defaultOrder, "unknown", "tns", "before"), defaultOrder);
  assert.equal(helpers.moveSidebarProject(defaultOrder, "tns", "unknown", "after"), defaultOrder);
  assert.equal(helpers.moveSidebarProject(defaultOrder, "tns", "focus-ai", "before"), defaultOrder);
});
