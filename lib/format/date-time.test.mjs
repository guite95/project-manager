import assert from "node:assert/strict";
import test from "node:test";
import { todayInSeoul } from "./date-time.ts";

test("서울 자정 경계에서 날짜 선택기의 오늘이 바뀐다", () => {
  assert.equal(todayInSeoul(new Date("2026-09-13T14:59:59.999Z")), "2026-09-13");
  assert.equal(todayInSeoul(new Date("2026-09-13T15:00:00.000Z")), "2026-09-14");
});

test("서울 새해 자정을 기준으로 연도도 바뀐다", () => {
  assert.equal(todayInSeoul(new Date("2026-12-31T15:00:00.000Z")), "2027-01-01");
});
