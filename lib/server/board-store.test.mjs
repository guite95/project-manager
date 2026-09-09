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
