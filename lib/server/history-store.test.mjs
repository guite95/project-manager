import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma, resetDatabase } from "./test-db.mjs";

const store = await import("./history-store.ts");

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

async function addCompletion(id, completedOn, title = `일 ${id}`) {
  await prisma.completion.create({
    data: {
      id,
      issueId: null,
      projectSlug: "tns",
      title,
      completedOn,
      completedAt: new Date(`${completedOn}T09:00:00.000Z`),
    },
  });
}

test("범위 안의 이력만 준다", async () => {
  await addCompletion("a", "2026-09-01");
  await addCompletion("b", "2026-09-05");
  await addCompletion("c", "2026-09-10");

  const rows = await store.listCompletions("2026-09-02", "2026-09-09");
  assert.deepEqual(rows.map((row) => row.id), ["b"]);
});

test("경계 날짜를 포함한다", async () => {
  await addCompletion("a", "2026-09-02");
  await addCompletion("b", "2026-09-09");

  const rows = await store.listCompletions("2026-09-02", "2026-09-09");
  assert.deepEqual(rows.map((row) => row.id).sort(), ["a", "b"]);
});

test("완료 날짜 내림차순으로 준다", async () => {
  await addCompletion("a", "2026-09-03");
  await addCompletion("b", "2026-09-07");
  await addCompletion("c", "2026-09-05");

  const rows = await store.listCompletions("2026-09-01", "2026-09-09");
  assert.deepEqual(rows.map((row) => row.id), ["b", "c", "a"]);
});

test("이력이 없으면 빈 배열", async () => {
  assert.deepEqual(await store.listCompletions("2026-09-01", "2026-09-09"), []);
});
