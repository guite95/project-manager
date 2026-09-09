import assert from "node:assert/strict";
import test from "node:test";

const { planRollover } = await import("./rollover.ts");

const row = (id, todayDate, done = false) => ({ id, todayDate, done });

test("오늘 올린 항목은 건드리지 않는다", () => {
  const plan = planRollover(
    [row("a", "2026-09-09"), row("b", "2026-09-09", true)],
    "2026-09-09",
  );
  assert.deepEqual(plan, { returnToPool: [], remove: [] });
});

test("지난 날짜의 미완료 항목은 풀로 되돌린다", () => {
  const plan = planRollover([row("a", "2026-09-08")], "2026-09-09");
  assert.deepEqual(plan, { returnToPool: ["a"], remove: [] });
});

test("지난 날짜의 완료 항목은 지운다", () => {
  const plan = planRollover([row("a", "2026-09-08", true)], "2026-09-09");
  assert.deepEqual(plan, { returnToPool: [], remove: ["a"] });
});

test("며칠 건너뛴 여러 날짜를 한 번에 정리한다", () => {
  const plan = planRollover(
    [
      row("a", "2026-09-01", true),
      row("b", "2026-09-05"),
      row("c", "2026-09-09"),
      row("d", "2026-09-08", true),
    ],
    "2026-09-09",
  );
  assert.deepEqual(plan, { returnToPool: ["b"], remove: ["a", "d"] });
});

test("미래 날짜는 정리하지 않는다", () => {
  const plan = planRollover([row("a", "2026-09-10", true)], "2026-09-09");
  assert.deepEqual(plan, { returnToPool: [], remove: [] });
});

test("빈 목록은 빈 계획을 준다", () => {
  assert.deepEqual(planRollover([], "2026-09-09"), {
    returnToPool: [],
    remove: [],
  });
});
