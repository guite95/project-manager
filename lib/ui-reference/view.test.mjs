import assert from "node:assert/strict";
import test from "node:test";
import { resolveFlowsView } from "./view.ts";

test("components만 UI 레퍼런스 뷰로 허용한다", () => {
  assert.equal(resolveFlowsView("components"), "components");
});

test("기본값과 알 수 없는 값은 프로젝트 뷰로 복구한다", () => {
  assert.equal(resolveFlowsView(undefined), "projects");
  assert.equal(resolveFlowsView("unknown"), "projects");
  assert.equal(resolveFlowsView(["components"]), "projects");
});
