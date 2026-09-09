import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma, resetDatabase } from "./test-db.mjs";

const store = await import("./notes-store.ts");

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const NOW = "2026-09-09T09:00:00.000Z";

test("빈 프로젝트는 빈 목록", async () => {
  assert.deepEqual(await store.listNotes("tns"), []);
});

test("만든 항목이 읽힌다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  const notes = await store.listNotes("tns");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, "n1");
  assert.equal(notes[0].content, "");
  assert.equal(notes[0].priority, "normal");
});

test("새 항목은 맨 위에 붙는다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.createNote({ id: "n2", projectSlug: "tns", now: NOW });
  const notes = await store.listNotes("tns");
  assert.deepEqual(notes.map((note) => note.id), ["n2", "n1"]);
});

test("다른 프로젝트의 항목은 섞이지 않는다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.createNote({ id: "n2", projectSlug: "common", now: NOW });
  assert.deepEqual(
    (await store.listNotes("tns")).map((note) => note.id),
    ["n1"],
  );
});

test("내용과 우선순위를 고친다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.updateNote(
    "n1",
    { content: "납기 확인", priority: "urgent" },
    "2026-09-10T00:00:00.000Z",
  );
  const [note] = await store.listNotes("tns");
  assert.equal(note.content, "납기 확인");
  assert.equal(note.priority, "urgent");
  assert.equal(note.updatedAt, "2026-09-10T00:00:00.000Z");
});

test("모르는 우선순위 값은 무시한다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.updateNote("n1", { priority: "엉뚱한값" }, NOW);
  const [note] = await store.listNotes("tns");
  assert.equal(note.priority, "normal");
});

test("지운 항목은 사라진다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.deleteNote("n1");
  assert.deepEqual(await store.listNotes("tns"), []);
});

test("순서를 바꾸면 그 순서로 읽힌다", async () => {
  for (const id of ["n1", "n2", "n3"]) {
    await store.createNote({ id, projectSlug: "tns", now: NOW });
  }
  await store.reorderNotes(["n1", "n3", "n2"]);
  assert.deepEqual(
    (await store.listNotes("tns")).map((note) => note.id),
    ["n1", "n3", "n2"],
  );
});
