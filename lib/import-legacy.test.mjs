import assert from "node:assert/strict";
import test from "node:test";

const { readLegacyData, clearLegacyData, hasLegacyData } = await import(
  "./import-legacy.ts"
);

function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
  };
}

const BOARD_KEY = "project-management.today-board.v1";
const NOTES_KEY = "project-management.project-notes.v1:tns";

const legacyBoard = (overrides = {}) =>
  JSON.stringify({
    date: "2026-09-08",
    issues: [],
    today: [],
    customProjects: [],
    projectOrder: [],
    collapsedProjects: [],
    ...overrides,
  });

test("아무것도 없으면 빈 결과", () => {
  const payload = readLegacyData(fakeStorage({}), ["tns"]);
  assert.equal(payload.board, null);
  assert.deepEqual(payload.notes, []);
  assert.equal(hasLegacyData(payload), false);
});

test("보드를 읽는다", () => {
  const storage = fakeStorage({
    [BOARD_KEY]: legacyBoard({
      issues: [
        {
          id: "a",
          projectSlug: "tns",
          title: "이슈",
          createdAt: "2026-09-08T00:00:00.000Z",
        },
      ],
    }),
  });
  const payload = readLegacyData(storage, ["tns"]);
  assert.equal(payload.board?.issues.length, 1);
  assert.equal(hasLegacyData(payload), true);
});

test("프로젝트별 명심할 점을 읽는다", () => {
  const storage = fakeStorage({
    [NOTES_KEY]: JSON.stringify([
      {
        id: "n1",
        content: "확인",
        priority: "high",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
    ]),
  });
  const payload = readLegacyData(storage, ["tns", "common"]);
  assert.deepEqual(
    payload.notes.map((entry) => [entry.projectSlug, entry.notes.length]),
    [["tns", 1]],
  );
  assert.equal(hasLegacyData(payload), true);
});

test("깨진 JSON 은 없는 것으로 다룬다", () => {
  const payload = readLegacyData(fakeStorage({ [BOARD_KEY]: "{{{" }), ["tns"]);
  assert.equal(payload.board, null);
  assert.equal(hasLegacyData(payload), false);
});

test("빈 보드만 있으면 이관할 게 없다", () => {
  const storage = fakeStorage({ [BOARD_KEY]: legacyBoard() });
  assert.equal(hasLegacyData(readLegacyData(storage, ["tns"])), false);
});

test("오늘 목록만 있어도 이관 대상이다", () => {
  const storage = fakeStorage({
    [BOARD_KEY]: legacyBoard({
      today: [
        {
          id: "a",
          projectSlug: "tns",
          title: "오늘 일",
          createdAt: "2026-09-08T00:00:00.000Z",
          done: false,
        },
      ],
    }),
  });
  assert.equal(hasLegacyData(readLegacyData(storage, ["tns"])), true);
});

test("직접 추가한 프로젝트만 있어도 이관 대상이다", () => {
  const storage = fakeStorage({
    [BOARD_KEY]: legacyBoard({
      customProjects: [
        { slug: "c1", title: "내 것", createdAt: "2026-09-08T00:00:00.000Z" },
      ],
    }),
  });
  assert.equal(hasLegacyData(readLegacyData(storage, ["tns"])), true);
});

test("지우면 키가 사라진다", () => {
  const storage = fakeStorage({ [BOARD_KEY]: "{}", [NOTES_KEY]: "[]" });
  clearLegacyData(storage, ["tns"]);
  assert.equal(storage.has(BOARD_KEY), false);
  assert.equal(storage.has(NOTES_KEY), false);
});
