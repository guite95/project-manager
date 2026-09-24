import assert from "node:assert/strict";
import test from "node:test";

const board = await import("./today-board.ts").catch(() => null);

function makeBoard(overrides = {}) {
  return {
    issues: [],
    today: [],
    customProjects: [],
    projectOrder: [],
    collapsedProjects: [],
    ...overrides,
  };
}

function issue(id, projectSlug = "tns", title = `이슈 ${id}`) {
  return { id, projectSlug, title, createdAt: "2026-09-09T00:00:00.000Z" };
}

function customProject(slug, title) {
  return { slug, title, createdAt: "2026-09-09T00:00:00.000Z" };
}

const REGISTRY = [
  { slug: "common", title: "공통" },
  { slug: "tns", title: "티앤에스" },
];

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

test("선택한 여러 이슈를 원래 순서대로 오늘 목록에 옮긴다", () => {
  const start = makeBoard({ issues: [issue("a"), issue("b"), issue("c")], today: [{ ...issue("d"), done: false }] });
  const moved = board.sendIssuesToToday(start, ["c", "a"]);
  assert.deepEqual(moved.issues.map((item) => item.id), ["b"]);
  assert.deepEqual(moved.today.map((item) => item.id), ["d", "a", "c"]);
  assert.equal(board.sendIssuesToToday(start, ["missing"]), start);
  assert.deepEqual(start.issues.map((item) => item.id), ["a", "b", "c"]);
});

test("선택한 이슈만 다른 프로젝트로 옮기고 드래그 ID를 안전하게 읽는다", () => {
  const start = makeBoard({ issues: [issue("a"), issue("b"), issue("c")] });
  const moved = board.moveIssuesToProject(start, ["a", "c"], "common");
  assert.deepEqual(moved.issues.map((item) => item.projectSlug), ["common", "tns", "common"]);
  assert.equal(board.moveIssuesToProject(start, ["missing"], "common"), start);
  assert.deepEqual(board.parseIssueDragIds('["a","c","a"]'), ["a", "c"]);
  assert.deepEqual(board.parseIssueDragIds("a"), ["a"]);
  assert.deepEqual(board.parseIssueDragIds('["a",5]'), []);
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
  assert.deepEqual(normalized.issues.map((i) => i.id), ["a", "c"]);
  assert.equal("done" in normalized.issues[1], false);
  // done 이 없는 today 항목은 버린다
  assert.deepEqual(normalized.today.map((i) => i.id), ["d"]);
});

test("두 목록에 겹치는 id 는 오늘의 할 일을 남긴다", () => {
  const normalized = board.normalizeTodayBoard(
    {
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
    const normalized = board.normalizeTodayBoard(bad);
    assert.deepEqual(normalized, {
      issues: [],
      today: [],
      customProjects: [],
      projectOrder: [],
      collapsedProjects: [],
    });
  }
});

test("레지스트리 → 직접 추가 → 미분류 순서로 묶는다", () => {
  const groups = board.groupIssuesByProject(
    [
      issue("a", "tns"),
      issue("b", "common"),
      issue("c", "사라진프로젝트"),
      issue("d", "custom-1"),
    ],
    REGISTRY,
    [customProject("custom-1", "내 프로젝트")],
  );

  assert.deepEqual(
    groups.map((g) => [
      g.slug,
      g.title,
      g.canAdd,
      g.removable,
      g.issues.map((i) => i.id),
    ]),
    [
      ["common", "공통", true, false, ["b"]],
      ["tns", "티앤에스", true, false, ["a"]],
      ["custom-1", "내 프로젝트", true, true, ["d"]],
      [null, "미분류", false, false, ["c"]],
    ],
  );
});

test("모르는 프로젝트의 이슈가 없으면 미분류 그룹을 만들지 않는다", () => {
  const groups = board.groupIssuesByProject(
    [issue("a", "tns")],
    [{ slug: "tns", title: "티앤에스" }],
    [],
  );

  assert.deepEqual(groups.map((g) => g.slug), ["tns"]);
});

test("직접 추가한 프로젝트는 이슈가 없어도 그룹으로 남는다", () => {
  const groups = board.groupIssuesByProject(
    [],
    [],
    [customProject("custom-1", "내 프로젝트")],
  );

  assert.deepEqual(
    groups.map((g) => [g.slug, g.title, g.removable, g.issues.length]),
    [["custom-1", "내 프로젝트", true, 0]],
  );
});

test("프로젝트를 추가하면 제목을 다듬어 목록 끝에 붙인다", () => {
  const start = makeBoard();

  const after = board.addProject(
    start,
    "  새 고객사  ",
    "custom-1",
    "2026-09-09T02:00:00.000Z",
  );

  assert.deepEqual(after.customProjects, [
    {
      slug: "custom-1",
      title: "새 고객사",
      createdAt: "2026-09-09T02:00:00.000Z",
    },
  ]);
  // 입력을 변형하지 않는다
  assert.deepEqual(start.customProjects, []);
});

test("제목이 공백뿐이면 프로젝트를 추가하지 않는다", () => {
  const start = makeBoard();
  assert.equal(
    board.addProject(start, "   ", "custom-1", "2026-09-09T02:00:00.000Z"),
    start,
  );
});

test("이미 쓰는 이름인지 레지스트리와 추가 목록 양쪽에서 본다", () => {
  const start = makeBoard({
    customProjects: [customProject("custom-1", "내 프로젝트")],
  });
  const taken = (title) => board.isProjectTitleTaken(start, title, REGISTRY);

  assert.equal(taken("내 프로젝트"), true, "직접 추가한 이름");
  assert.equal(taken("  내 프로젝트  "), true, "앞뒤 공백은 무시한다");
  assert.equal(taken("티앤에스"), true, "레지스트리 이름");
  assert.equal(taken("새 이름"), false);
  assert.equal(taken("   "), false, "빈 제목은 중복 판정 대상이 아니다");
});

test("프로젝트를 지워도 그 이슈는 남아 미분류로 묶인다", () => {
  const start = makeBoard({
    issues: [issue("a", "custom-1"), issue("b", "tns")],
    customProjects: [customProject("custom-1", "내 프로젝트")],
  });

  const after = board.removeProject(start, "custom-1");

  assert.deepEqual(after.customProjects, []);
  assert.deepEqual(after.issues.map((i) => i.id), ["a", "b"]);

  const groups = board.groupIssuesByProject(after.issues, REGISTRY, after.customProjects);
  const ungrouped = groups.find((g) => g.slug === null);
  assert.deepEqual(ungrouped.issues.map((i) => i.id), ["a"]);
});

test("없는 프로젝트를 지우면 보드를 그대로 돌려준다", () => {
  const start = makeBoard({
    customProjects: [customProject("custom-1", "내 프로젝트")],
  });
  assert.equal(board.removeProject(start, "없음"), start);
});

test("customProjects 가 없던 옛 저장값도 그대로 연다", () => {
  const normalized = board.normalizeTodayBoard(
    { date: "2026-09-09", issues: [issue("a")], today: [] },
  );

  assert.deepEqual(normalized.customProjects, []);
  assert.deepEqual(normalized.issues.map((i) => i.id), ["a"]);
});

test("저장된 프로젝트 목록에서 형태가 어긋난 항목과 중복 slug 를 지운다", () => {
  const normalized = board.normalizeTodayBoard(
    {
      issues: [],
      today: [],
      customProjects: [
        customProject("custom-1", "내 프로젝트"),
        customProject("custom-1", "중복 slug"),
        { slug: "custom-2" },
        null,
        customProject("custom-3", "또 하나"),
      ],
    },
    "2026-09-09",
  );

  assert.deepEqual(
    normalized.customProjects.map((p) => p.slug),
    ["custom-1", "custom-3"],
  );
});

test("저장된 순서대로 그룹을 늘어놓고 미분류는 끝에 둔다", () => {
  const groups = board.groupIssuesByProject(
    [issue("a", "tns"), issue("b", "없는프로젝트")],
    REGISTRY,
    [customProject("custom-1", "내 프로젝트")],
    ["custom-1", "tns", "common"],
  );

  assert.deepEqual(
    groups.map((g) => g.slug),
    ["custom-1", "tns", "common", null],
  );
});

test("순서에 없는 프로젝트는 기본 순서로 뒤에 붙는다", () => {
  // 레지스트리에 프로젝트가 새로 생겨도 목록에서 빠지면 안 된다.
  const groups = board.groupIssuesByProject(
    [],
    [...REGISTRY, { slug: "새프로젝트", title: "새 프로젝트" }],
    [customProject("custom-1", "내 프로젝트")],
    ["custom-1", "tns"],
  );

  assert.deepEqual(
    groups.map((g) => g.slug),
    ["custom-1", "tns", "common", "새프로젝트"],
  );
});

test("순서에 남은 사라진 프로젝트 slug 는 무시한다", () => {
  const groups = board.groupIssuesByProject(
    [],
    [{ slug: "tns", title: "티앤에스" }],
    [],
    ["지워진프로젝트", "tns"],
  );

  assert.deepEqual(groups.map((g) => g.slug), ["tns"]);
});

test("프로젝트를 다른 프로젝트 앞뒤로 옮긴다", () => {
  const start = makeBoard();
  const order = ["common", "tns", "custom-1"];

  const toFront = board.moveProject(start, order, "custom-1", "common", "before");
  assert.deepEqual(toFront.projectOrder, ["custom-1", "common", "tns"]);

  const toBack = board.moveProject(start, order, "common", "custom-1", "after");
  assert.deepEqual(toBack.projectOrder, ["tns", "custom-1", "common"]);

  // 한 번 옮기면 건드리지 않은 프로젝트까지 순서가 명시적으로 기록된다
  assert.deepEqual(start.projectOrder, []);
});

test("제자리로 옮기거나 모르는 slug 면 보드를 그대로 돌려준다", () => {
  const start = makeBoard();
  const order = ["common", "tns"];

  assert.equal(board.moveProject(start, order, "tns", "tns", "before"), start);
  assert.equal(board.moveProject(start, order, "없음", "tns", "before"), start);
  assert.equal(board.moveProject(start, order, "tns", "없음", "before"), start);
});

test("바로 옆으로 옮겨 결과가 같으면 보드를 그대로 돌려준다", () => {
  const start = makeBoard({ projectOrder: ["common", "tns"] });
  const order = ["common", "tns"];

  // common 을 tns 앞으로 = 이미 그 자리
  assert.equal(board.moveProject(start, order, "common", "tns", "before"), start);
});

test("projectOrder 가 없던 옛 저장값도 그대로 연다", () => {
  const normalized = board.normalizeTodayBoard(
    { date: "2026-09-09", issues: [], today: [], customProjects: [] },
  );

  assert.deepEqual(normalized.projectOrder, []);
});

test("저장된 순서에서 문자열이 아닌 값과 중복을 지운다", () => {
  const normalized = board.normalizeTodayBoard(
    {
      issues: [],
      today: [],
      customProjects: [],
      projectOrder: ["tns", "tns", 5, null, "", "common"],
    },
    "2026-09-09",
  );

  assert.deepEqual(normalized.projectOrder, ["tns", "common"]);
});

test("프로젝트 접기는 토글이다", () => {
  const start = makeBoard();

  const collapsed = board.toggleProjectCollapsed(start, "tns");
  assert.deepEqual(collapsed.collapsedProjects, ["tns"]);

  const expanded = board.toggleProjectCollapsed(collapsed, "tns");
  assert.deepEqual(expanded.collapsedProjects, []);

  // 입력을 변형하지 않는다
  assert.deepEqual(start.collapsedProjects, []);
});

test("여러 프로젝트를 따로 접어둔다", () => {
  const start = makeBoard({ collapsedProjects: ["common"] });

  const after = board.toggleProjectCollapsed(start, "tns");
  assert.deepEqual(after.collapsedProjects, ["common", "tns"]);

  const reopened = board.toggleProjectCollapsed(after, "common");
  assert.deepEqual(reopened.collapsedProjects, ["tns"]);
});

test("collapsedProjects 가 없던 옛 저장값도 그대로 연다", () => {
  const normalized = board.normalizeTodayBoard(
    { date: "2026-09-09", issues: [], today: [] },
  );

  assert.deepEqual(normalized.collapsedProjects, []);
});

test("저장된 접힘 목록에서 문자열이 아닌 값과 중복을 지운다", () => {
  const normalized = board.normalizeTodayBoard(
    {
      issues: [],
      today: [],
      collapsedProjects: ["tns", "tns", 5, null, "", "common"],
    },
    "2026-09-09",
  );

  assert.deepEqual(normalized.collapsedProjects, ["tns", "common"]);
});


test("이슈 제목을 고친다", () => {
  const start = makeBoard({ issues: [issue("a", "tns", "옛 제목")] });
  const after = board.renameIssue(start, "a", "새 제목");

  assert.equal(after.issues[0].title, "새 제목");
  // 입력을 변형하지 않는다
  assert.equal(start.issues[0].title, "옛 제목");
});

test("오늘 목록의 항목도 제목을 고친다", () => {
  const start = makeBoard({
    today: [{ ...issue("a", "tns", "옛 제목"), done: true }],
  });
  const after = board.renameIssue(start, "a", "새 제목");

  assert.equal(after.today[0].title, "새 제목");
  // 완료 표시는 그대로
  assert.equal(after.today[0].done, true);
});

test("제목 앞뒤 공백은 떼어낸다", () => {
  const start = makeBoard({ issues: [issue("a")] });
  assert.equal(board.renameIssue(start, "a", "  다듬은 제목  ").issues[0].title, "다듬은 제목");
});

test("빈 제목이면 보드를 그대로 돌려준다", () => {
  const start = makeBoard({ issues: [issue("a", "tns", "옛 제목")] });
  assert.equal(board.renameIssue(start, "a", ""), start);
  assert.equal(board.renameIssue(start, "a", "   "), start);
});

test("같은 제목이면 보드를 그대로 돌려준다", () => {
  const start = makeBoard({ issues: [issue("a", "tns", "그대로")] });
  assert.equal(board.renameIssue(start, "a", "그대로"), start);
});

test("없는 id 면 보드를 그대로 돌려준다", () => {
  const start = makeBoard({ issues: [issue("a")] });
  assert.equal(board.renameIssue(start, "없음", "새 제목"), start);
});
