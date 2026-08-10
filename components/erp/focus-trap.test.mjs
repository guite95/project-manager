import assert from "node:assert/strict";
import test from "node:test";
import { resolveFocusTrapTarget } from "./focus-trap.ts";

test("포커스가 모달 밖이면 Tab 방향에 맞는 경계로 복귀시킨다", () => {
  assert.equal(
    resolveFocusTrapTarget({ inside: false, atFirst: false, atLast: false, shiftKey: false }),
    "first",
  );
  assert.equal(
    resolveFocusTrapTarget({ inside: false, atFirst: false, atLast: false, shiftKey: true }),
    "last",
  );
});

test("모달 경계에서는 반대편 경계로 순환한다", () => {
  assert.equal(
    resolveFocusTrapTarget({ inside: true, atFirst: true, atLast: false, shiftKey: true }),
    "last",
  );
  assert.equal(
    resolveFocusTrapTarget({ inside: true, atFirst: false, atLast: true, shiftKey: false }),
    "first",
  );
});

test("모달 내부 중간 포커스는 그대로 둔다", () => {
  assert.equal(
    resolveFocusTrapTarget({ inside: true, atFirst: false, atLast: false, shiftKey: false }),
    null,
  );
});
