import assert from "node:assert/strict";
import test from "node:test";

const { groupCompletionsByDate } = await import("./completions.ts");

const REGISTRY = [{ slug: "tns", title: "TNS" }];

const done = (id, projectSlug, title, completedOn) => ({
  id,
  projectSlug,
  title,
  completedOn,
  completedAt: `${completedOn}T09:00:00.000Z`,
});

test("날짜 내림차순으로 묶는다", () => {
  const days = groupCompletionsByDate(
    [
      done("1", "tns", "가", "2026-09-07"),
      done("2", "tns", "나", "2026-09-09"),
      done("3", "tns", "다", "2026-09-08"),
    ],
    REGISTRY,
    [],
    [],
  );
  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-09-09", "2026-09-08", "2026-09-07"],
  );
});

test("한 날짜 안에서 프로젝트별로 묶는다", () => {
  const days = groupCompletionsByDate(
    [
      done("1", "tns", "가", "2026-09-09"),
      done("2", "custom-1", "나", "2026-09-09"),
    ],
    REGISTRY,
    [{ slug: "custom-1", title: "직접 추가", createdAt: "2026-09-01T00:00:00.000Z" }],
    [],
  );
  assert.equal(days.length, 1);
  assert.deepEqual(
    days[0].groups.map((group) => [group.title, group.issues.length]),
    [["TNS", 1], ["직접 추가", 1]],
  );
});

test("항목이 없는 프로젝트 그룹은 넣지 않는다", () => {
  const days = groupCompletionsByDate(
    [done("1", "tns", "가", "2026-09-09")],
    [...REGISTRY, { slug: "common", title: "공통" }],
    [],
    [],
  );
  assert.deepEqual(
    days[0].groups.map((group) => group.title),
    ["TNS"],
  );
});

test("사라진 프로젝트의 항목은 미분류로 묶인다", () => {
  const days = groupCompletionsByDate(
    [done("1", "지워진프로젝트", "가", "2026-09-09")],
    REGISTRY,
    [],
    [],
  );
  assert.deepEqual(
    days[0].groups.map((group) => group.title),
    ["미분류"],
  );
});

test("완료가 없으면 빈 배열", () => {
  assert.deepEqual(groupCompletionsByDate([], REGISTRY, [], []), []);
});
