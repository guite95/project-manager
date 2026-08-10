import assert from "node:assert/strict";
import test from "node:test";
import { resolveDropdownKey } from "./dropdown-navigation.ts";

test("열린 일반 드롭다운에서 화살표와 Enter로 항목을 선택한다", () => {
  assert.deepEqual(resolveDropdownKey("ArrowDown", true, 0, 2), {
    type: "move",
    index: 1,
  });
  assert.deepEqual(resolveDropdownKey("Enter", true, 1, 2), {
    type: "choose",
    index: 1,
  });
});

test("Escape는 열린 메뉴를 닫고 닫힌 메뉴의 화살표는 메뉴를 연다", () => {
  assert.deepEqual(resolveDropdownKey("Escape", true, 0, 2), {
    type: "close",
  });
  assert.deepEqual(resolveDropdownKey("ArrowDown", false, 0, 2), {
    type: "open",
  });
});

test("선택지가 없으면 이동이나 선택을 만들지 않는다", () => {
  assert.equal(resolveDropdownKey("ArrowDown", true, 0, 0), null);
  assert.equal(resolveDropdownKey("Enter", true, 0, 0), null);
});
