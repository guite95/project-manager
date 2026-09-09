import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma, resetDatabase } from "./test-db.mjs";

const store = await import("./board-store.ts");

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const NOW = "2026-09-09T09:00:00.000Z";

async function addIssue(id, projectSlug = "tns", title = `이슈 ${id}`) {
  return store.createIssue({ id, projectSlug, title, now: NOW });
}

test("빈 DB 는 빈 보드를 준다", async () => {
  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board, {
    issues: [],
    today: [],
    customProjects: [],
    projectOrder: [],
    collapsedProjects: [],
  });
});

test("만든 이슈는 풀에 들어간다", async () => {
  await addIssue("a");
  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.issues.length, 1);
  assert.equal(board.issues[0].title, "이슈 a");
  assert.equal(board.today.length, 0);
});

test("오늘로 옮기면 풀에서 빠진다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.issues.length, 0);
  assert.deepEqual(
    board.today.map((item) => [item.id, item.done]),
    [["a", false]],
  );
});

test("체크하면 완료 이력이 쌓인다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });

  const rows = await prisma.completion.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].completedOn, "2026-09-09");
  assert.equal(rows[0].title, "이슈 a");
});

test("체크를 풀면 그날 이력이 사라진다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });
  await store.setIssueDone({
    id: "a",
    done: false,
    completionId: "c2",
    today: "2026-09-09",
    now: NOW,
  });

  assert.equal(await prisma.completion.count(), 0);
});

test("이슈를 지워도 완료 이력은 남는다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });
  await store.deleteIssue("a");

  const rows = await prisma.completion.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "이슈 a");
  assert.equal(rows[0].issueId, null);
});

test("날짜가 바뀌면 미완료는 풀로, 완료는 사라진다", async () => {
  await addIssue("a");
  await addIssue("b");
  await store.moveIssue("a", "today", "2026-09-08");
  await store.moveIssue("b", "today", "2026-09-08");
  await store.setIssueDone({
    id: "b",
    done: true,
    completionId: "c1",
    today: "2026-09-08",
    now: NOW,
  });

  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues.map((issue) => issue.id), ["a"]);
  assert.equal(board.today.length, 0);
  // 이력은 남는다.
  assert.equal(await prisma.completion.count(), 1);
});

test("완료한 항목을 풀로 되돌리면 그날 이력도 사라진다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });
  await store.moveIssue("a", "pool", "2026-09-09");

  assert.equal(await prisma.completion.count(), 0);
  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues.map((issue) => issue.id), ["a"]);
});

test("순서를 바꾸면 그 순서로 읽힌다", async () => {
  await addIssue("a");
  await addIssue("b");
  await addIssue("c");
  await store.reorderIssues(["c", "a", "b"]);

  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues.map((issue) => issue.id), ["c", "a", "b"]);
});

test("커스텀 프로젝트를 지워도 이슈는 남는다", async () => {
  await store.createCustomProject({ slug: "p1", title: "직접", now: NOW });
  await addIssue("a", "p1");
  await store.deleteCustomProject("p1");

  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.customProjects.length, 0);
  assert.deepEqual(board.issues.map((issue) => issue.id), ["a"]);
});

test("설정은 저장한 대로 읽힌다", async () => {
  await store.saveSettings({
    projectOrder: ["tns", "common"],
    collapsedProjects: ["common"],
  });
  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.projectOrder, ["tns", "common"]);
  assert.deepEqual(board.collapsedProjects, ["common"]);
});

/* ------------------------------------------------------------------ 이관 */

const legacyIssue = (id, projectSlug = "tns", title = `옛 ${id}`) => ({
  id,
  projectSlug,
  title,
  createdAt: "2026-09-08T00:00:00.000Z",
});

test("빈 DB 는 비어 있다고 본다", async () => {
  assert.equal(await store.isBoardEmpty(), true);
});

test("이슈가 하나라도 있으면 비어 있지 않다", async () => {
  await addIssue("a");
  assert.equal(await store.isBoardEmpty(), false);
});

test("명심할 점만 있어도 비어 있지 않다", async () => {
  await prisma.projectNote.create({
    data: {
      id: "n1",
      projectSlug: "tns",
      content: "확인",
      priority: "normal",
      position: 0,
      updatedAt: new Date(NOW),
    },
  });
  assert.equal(await store.isBoardEmpty(), false);
});

test("옛 데이터를 순서 그대로 넣는다", async () => {
  await store.importLegacy({
    board: {
      issues: [legacyIssue("a"), legacyIssue("b")],
      today: [{ ...legacyIssue("c"), done: true }],
      customProjects: [
        { slug: "c1", title: "내 것", createdAt: "2026-09-01T00:00:00.000Z" },
      ],
      projectOrder: ["c1", "tns"],
      collapsedProjects: ["tns"],
    },
    notes: [
      {
        projectSlug: "tns",
        notes: [
          { id: "n1", content: "첫째", priority: "urgent", updatedAt: NOW },
          { id: "n2", content: "둘째", priority: "low", updatedAt: NOW },
        ],
      },
    ],
    today: "2026-09-09",
    now: NOW,
  });

  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues.map((issue) => issue.id), ["a", "b"]);
  assert.deepEqual(board.today.map((item) => [item.id, item.done]), [["c", true]]);
  assert.deepEqual(board.customProjects.map((p) => p.slug), ["c1"]);
  assert.deepEqual(board.projectOrder, ["c1", "tns"]);
  assert.deepEqual(board.collapsedProjects, ["tns"]);

  const notes = await prisma.projectNote.findMany({ orderBy: { position: "asc" } });
  assert.deepEqual(notes.map((note) => [note.id, note.content]), [
    ["n1", "첫째"],
    ["n2", "둘째"],
  ]);
});

test("이관한 오늘 항목은 오늘 날짜를 달아 롤오버되지 않는다", async () => {
  await store.importLegacy({
    board: {
      issues: [],
      today: [{ ...legacyIssue("c"), done: false }],
      customProjects: [],
      projectOrder: [],
      collapsedProjects: [],
    },
    notes: [],
    today: "2026-09-09",
    now: NOW,
  });

  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.today.map((item) => item.id), ["c"]);
});

test("보드가 null 이어도 명심할 점만 넣는다", async () => {
  await store.importLegacy({
    board: null,
    notes: [
      {
        projectSlug: "common",
        notes: [{ id: "n1", content: "메모", priority: "normal", updatedAt: NOW }],
      },
    ],
    today: "2026-09-09",
    now: NOW,
  });

  assert.equal(await prisma.projectNote.count(), 1);
  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues, []);
});

/* ------------------------------------------------------------- 제목 수정 */

test("이슈 제목을 고친다", async () => {
  await addIssue("a");
  await store.setIssueTitle("a", "고친 제목");

  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.issues[0].title, "고친 제목");
});

test("제목 앞뒤 공백은 떼어낸다", async () => {
  await addIssue("a");
  await store.setIssueTitle("a", "  다듬은 제목  ");

  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.issues[0].title, "다듬은 제목");
});

test("빈 제목은 무시한다", async () => {
  await addIssue("a", "tns", "원래 제목");
  await store.setIssueTitle("a", "   ");

  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.issues[0].title, "원래 제목");
});

test("오늘 목록의 항목도 제목을 고친다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueTitle("a", "고친 제목");

  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.today[0].title, "고친 제목");
});

test("제목을 고쳐도 이미 쌓인 완료 이력은 그대로다", async () => {
  await addIssue("a", "tns", "완료 당시 제목");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });
  await store.setIssueTitle("a", "나중에 고친 제목");

  const rows = await prisma.completion.findMany();
  assert.equal(rows[0].title, "완료 당시 제목");
});

test("없는 id 는 던지지 않는다", async () => {
  await store.setIssueTitle("없음", "아무 제목");
  assert.equal(await prisma.issue.count(), 0);
});
