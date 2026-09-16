import assert from "node:assert/strict";
import test from "node:test";

const projectNotes = await import("./project-notes.ts").catch(() => null);

test("프로젝트마다 서로 다른 명심할 점 저장 키를 사용한다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  assert.equal(
    projectNotes.projectNotesStorageKey("tns"),
    "project-management.project-notes.v1:tns",
  );
  assert.notEqual(
    projectNotes.projectNotesStorageKey("tns"),
    projectNotes.projectNotesStorageKey("common"),
  );
});

test("프로젝트 명심할 점 페이지 주소를 일관되게 만든다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  assert.equal(typeof projectNotes.projectNotesHref, "function");
  assert.equal(projectNotes.projectNotesHref("tns"), "/flows/tns/notes");
  assert.equal(
    projectNotes.projectNotesProjectSlug("/flows/tns/notes"),
    "tns",
  );
  assert.equal(projectNotes.projectNotesProjectSlug("/flows/tns"), null);
});

test("새 행은 보통 우선순위와 빈 내용으로 생성한다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  assert.deepEqual(
    projectNotes.createProjectNote("note-1", "2026-08-28T09:00:00.000Z"),
    {
      id: "note-1",
      content: "",
      priority: "normal",
      updatedAt: "2026-08-28T09:00:00.000Z",
    },
  );
});

test("저장 데이터에서 유효한 행만 유지하고 중복 ID를 제거한다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  assert.deepEqual(
    projectNotes.normalizeProjectNotes([
      {
        id: "note-1",
        content: "고객 확인 전 범위를 확정하지 않기",
        priority: "urgent",
        updatedAt: "2026-08-28T09:00:00.000Z",
      },
      {
        id: "note-1",
        content: "중복 행",
        priority: "low",
        updatedAt: "2026-08-28T09:01:00.000Z",
      },
      {
        id: "note-2",
        content: "",
        priority: "normal",
        updatedAt: "2026-08-28T09:02:00.000Z",
      },
      {
        id: "note-3",
        content: 3,
        priority: "high",
        updatedAt: "2026-08-28T09:03:00.000Z",
      },
      {
        id: "note-4",
        content: "잘못된 우선순위",
        priority: "unknown",
        updatedAt: "2026-08-28T09:04:00.000Z",
      },
    ]),
    [
      {
        id: "note-1",
        content: "고객 확인 전 범위를 확정하지 않기",
        priority: "urgent",
        updatedAt: "2026-08-28T09:00:00.000Z",
      },
      {
        id: "note-2",
        content: "",
        priority: "normal",
        updatedAt: "2026-08-28T09:02:00.000Z",
      },
    ],
  );
  assert.deepEqual(projectNotes.normalizeProjectNotes("broken"), []);
});

test("행 수정은 선택한 행만 바꾸고 수정 시각을 갱신한다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  const notes = [
    {
      id: "note-1",
      content: "첫 번째",
      priority: "normal",
      updatedAt: "2026-08-28T09:00:00.000Z",
    },
    {
      id: "note-2",
      content: "두 번째",
      priority: "low",
      updatedAt: "2026-08-28T09:00:00.000Z",
    },
  ];

  assert.deepEqual(
    projectNotes.updateProjectNote(
      notes,
      "note-2",
      { content: "수정한 내용", priority: "high" },
      "2026-08-28T10:00:00.000Z",
    ),
    [
      notes[0],
      {
        id: "note-2",
        content: "수정한 내용",
        priority: "high",
        updatedAt: "2026-08-28T10:00:00.000Z",
      },
    ],
  );
});

test("행 순서를 기준 행 앞뒤로 옮긴다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  const notes = ["note-1", "note-2", "note-3"].map((id) => ({
    id,
    content: id,
    priority: "normal",
    updatedAt: "2026-08-28T09:00:00.000Z",
  }));

  assert.deepEqual(
    projectNotes
      .moveProjectNote(notes, "note-3", "note-1", "before")
      .map((note) => note.id),
    ["note-3", "note-1", "note-2"],
  );
  assert.deepEqual(
    projectNotes
      .moveProjectNote(notes, "note-1", "note-3", "after")
      .map((note) => note.id),
    ["note-2", "note-3", "note-1"],
  );
  assert.deepEqual(
    projectNotes
      .moveProjectNote(notes, "note-1", "note-3", "before")
      .map((note) => note.id),
    ["note-2", "note-1", "note-3"],
  );
});

test("행 순서를 옮겨도 내용과 수정 시각은 그대로다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  const notes = [
    {
      id: "note-1",
      content: "첫 번째",
      priority: "urgent",
      updatedAt: "2026-08-28T09:00:00.000Z",
    },
    {
      id: "note-2",
      content: "두 번째",
      priority: "low",
      updatedAt: "2026-08-28T09:30:00.000Z",
    },
  ];

  assert.deepEqual(
    projectNotes.moveProjectNote(notes, "note-2", "note-1", "before"),
    [notes[1], notes[0]],
  );
});

test("옮길 자리가 지금과 같으면 원래 배열을 그대로 돌려준다", () => {
  assert.ok(projectNotes, "project-notes 모듈이 필요하다");
  const notes = ["note-1", "note-2"].map((id) => ({
    id,
    content: id,
    priority: "normal",
    updatedAt: "2026-08-28T09:00:00.000Z",
  }));

  // 자기 자신, 모르는 id, 이미 그 자리인 이동 — 셋 다 상태를 건드리지 않는다.
  assert.equal(projectNotes.moveProjectNote(notes, "note-1", "note-1", "before"), notes);
  assert.equal(projectNotes.moveProjectNote(notes, "note-1", "note-9", "before"), notes);
  assert.equal(projectNotes.moveProjectNote(notes, "note-9", "note-1", "before"), notes);
  assert.equal(projectNotes.moveProjectNote(notes, "note-1", "note-2", "before"), notes);
  assert.equal(projectNotes.moveProjectNote(notes, "note-2", "note-1", "after"), notes);
});

test("공통 명심할 점을 지원하고 고객 프로젝트에는 표시하지 않는다", () => {
  assert.equal(projectNotes.hasProjectNotes("common"), true);
  assert.equal(projectNotes.hasProjectNotes("tns"), false);
  assert.equal(projectNotes.hasProjectNotes(""), false);
  assert.equal(projectNotes.NOTES_PROJECT_SLUG, "common");
});
