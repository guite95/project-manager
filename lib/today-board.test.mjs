import assert from "node:assert/strict";
import test from "node:test";

const board = await import("./today-board.ts").catch(() => null);

function makeBoard(overrides = {}) {
  return {
    date: "2026-09-09",
    issues: [],
    today: [],
    ...overrides,
  };
}

function issue(id, projectSlug = "tns", title = `이슈 ${id}`) {
  return { id, projectSlug, title, createdAt: "2026-09-09T00:00:00.000Z" };
}

test("로컬 시간 기준으로 날짜 문자열을 만든다", () => {
  assert.ok(board, "today-board 모듈이 필요하다");
  // 한국 시간 오전 8시. UTC 로 계산하면 하루 밀린다.
  assert.equal(board.todayDateString(new Date(2026, 8, 9, 8, 0, 0)), "2026-09-09");
  assert.equal(board.todayDateString(new Date(2026, 0, 1, 0, 0, 0)), "2026-01-01");
});

test("저장 키는 프로젝트를 나누지 않고 하나다", () => {
  assert.equal(
    board.TODAY_BOARD_STORAGE_KEY,
    "project-management.today-board.v1",
  );
});

test("날짜가 바뀌면 완료 항목은 버리고 미완료 항목만 풀로 되돌린다", () => {
  const before = makeBoard({
    date: "2026-09-08",
    issues: [issue("a")],
    today: [
      { ...issue("b"), done: true },
      { ...issue("c"), done: false },
    ],
  });

  const after = board.rollOverBoard(before, "2026-09-09");

  assert.equal(after.date, "2026-09-09");
  assert.deepEqual(after.today, []);
  assert.deepEqual(
    after.issues.map((i) => i.id),
    ["a", "c"],
  );
  // 풀로 돌아온 항목에는 done 이 남지 않는다
  assert.equal("done" in after.issues[1], false);
  // 입력을 변형하지 않는다
  assert.equal(before.today.length, 2);
});

test("같은 날짜면 롤오버가 아무것도 바꾸지 않는다", () => {
  const before = makeBoard({
    today: [{ ...issue("b"), done: true }],
  });

  assert.equal(board.rollOverBoard(before, "2026-09-09"), before);
});

test("오늘로 보냈다가 되돌리면 항목이 풀에만 남는다", () => {
  const start = makeBoard({ issues: [issue("a"), issue("b")] });

  const sent = board.sendToToday(start, "a");
  assert.deepEqual(sent.issues.map((i) => i.id), ["b"]);
  assert.deepEqual(sent.today.map((i) => i.id), ["a"]);
  assert.equal(sent.today[0].done, false);

  const back = board.returnToPool(sent, "a");
  assert.deepEqual(back.today, []);
  assert.deepEqual(back.issues.map((i) => i.id), ["b", "a"]);
  assert.equal("done" in back.issues[1], false);
});

test("없는 id 로 옮기면 보드를 그대로 돌려준다", () => {
  const start = makeBoard({ issues: [issue("a")] });
  assert.equal(board.sendToToday(start, "없음"), start);
  assert.equal(board.returnToPool(start, "없음"), start);
});

test("체크는 대상 항목만 바꾼다", () => {
  const start = makeBoard({
    today: [
      { ...issue("a"), done: false },
      { ...issue("b"), done: false },
    ],
  });

  const after = board.toggleDone(start, "a");

  assert.equal(after.today[0].done, true);
  assert.equal(after.today[1].done, false);
  assert.equal(start.today[0].done, false);
});

test("이슈 추가는 제목을 다듬고, 공백뿐이면 무시한다", () => {
  const start = makeBoard();

  const added = board.addIssue(
    start,
    "tns",
    "  가격표 확인  ",
    "id-1",
    "2026-09-09T01:00:00.000Z",
  );
  assert.equal(added.issues.length, 1);
  assert.equal(added.issues[0].title, "가격표 확인");
  assert.equal(added.issues[0].projectSlug, "tns");
  assert.equal(added.issues[0].createdAt, "2026-09-09T01:00:00.000Z");

  assert.equal(
    board.addIssue(start, "tns", "   ", "id-2", "2026-09-09T01:00:00.000Z"),
    start,
  );
});

test("이슈 삭제는 풀에서만 지운다", () => {
  const start = makeBoard({
    issues: [issue("a")],
    today: [{ ...issue("b"), done: false }],
  });

  const after = board.removeIssue(start, "a");
  assert.deepEqual(after.issues, []);
  assert.equal(after.today.length, 1);
});

test("깨진 저장값에서 유효한 항목만 살리고 중복 id 를 지운다", () => {
  const normalized = board.normalizeTodayBoard(
    {
      date: "엉망",
      issues: [
        issue("a"),
        issue("a"), // 중복
        { id: "b" }, // 형태 미달
        null,
        { ...issue("c"), done: true }, // 여분 필드는 떨어져 나간다
      ],
      today: [{ ...issue("d"), done: false }, issue("e")],
    },
    "2026-09-09",
  );

  assert.equal(normalized.date, "2026-09-09");
  assert.deepEqual(normalized.issues.map((i) => i.id), ["a", "c"]);
  assert.equal("done" in normalized.issues[1], false);
  // done 이 없는 today 항목은 버린다
  assert.deepEqual(normalized.today.map((i) => i.id), ["d"]);
});

test("두 목록에 겹치는 id 는 오늘의 할 일을 남긴다", () => {
  const normalized = board.normalizeTodayBoard(
    {
      date: "2026-09-09",
      issues: [issue("a")],
      today: [{ ...issue("a"), done: true }],
    },
    "2026-09-09",
  );

  assert.deepEqual(normalized.issues, []);
  assert.deepEqual(normalized.today.map((i) => i.id), ["a"]);
});

test("저장값이 객체가 아니면 빈 보드를 만든다", () => {
  for (const bad of [null, 5, "문자열", []]) {
    const normalized = board.normalizeTodayBoard(bad, "2026-09-09");
    assert.deepEqual(normalized, { date: "2026-09-09", issues: [], today: [] });
  }
});

test("이슈를 레지스트리 순서로 묶고 모르는 프로젝트는 미분류로 몬다", () => {
  const groups = board.groupIssuesByProject(
    [issue("a", "tns"), issue("b", "common"), issue("c", "사라진프로젝트")],
    [
      { slug: "common", title: "공통" },
      { slug: "tns", title: "티앤에스" },
    ],
  );

  assert.deepEqual(
    groups.map((g) => [g.slug, g.title, g.canAdd, g.issues.map((i) => i.id)]),
    [
      ["common", "공통", true, ["b"]],
      ["tns", "티앤에스", true, ["a"]],
      [null, "미분류", false, ["c"]],
    ],
  );
});

test("모르는 프로젝트의 이슈가 없으면 미분류 그룹을 만들지 않는다", () => {
  const groups = board.groupIssuesByProject(
    [issue("a", "tns")],
    [{ slug: "tns", title: "티앤에스" }],
  );

  assert.deepEqual(groups.map((g) => g.slug), ["tns"]);
});
