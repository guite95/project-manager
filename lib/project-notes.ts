export const PROJECT_NOTE_PRIORITIES = [
  { value: "urgent", label: "긴급" },
  { value: "high", label: "높음" },
  { value: "normal", label: "보통" },
  { value: "low", label: "낮음" },
] as const;

export type ProjectNotePriority =
  (typeof PROJECT_NOTE_PRIORITIES)[number]["value"];

export type ProjectNote = {
  id: string;
  content: string;
  priority: ProjectNotePriority;
  updatedAt: string;
};

const PRIORITIES = new Set<ProjectNotePriority>(
  PROJECT_NOTE_PRIORITIES.map((priority) => priority.value),
);

/** dataTransfer 종류. 행 드래그가 아닌 것을 끌어와도 표가 반응하지 않게 한다. */
export const PROJECT_NOTE_DRAG_TYPE = "application/x-project-note";

export function projectNotesStorageKey(projectSlug: string): string {
  return `project-management.project-notes.v1:${projectSlug}`;
}

export function projectNotesHref(projectSlug: string): string {
  return `/flows/${encodeURIComponent(projectSlug)}/notes`;
}

export function projectNotesProjectSlug(pathname: string): string | null {
  const match = pathname.match(/^\/flows\/([^/]+)\/notes\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function createProjectNote(
  id: string,
  updatedAt: string,
): ProjectNote {
  return {
    id,
    content: "",
    priority: "normal",
    updatedAt,
  };
}

function isProjectNote(value: unknown): value is ProjectNote {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    note.id.length > 0 &&
    typeof note.content === "string" &&
    typeof note.priority === "string" &&
    PRIORITIES.has(note.priority as ProjectNotePriority) &&
    typeof note.updatedAt === "string" &&
    !Number.isNaN(Date.parse(note.updatedAt))
  );
}

export function normalizeProjectNotes(value: unknown): ProjectNote[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((note): note is ProjectNote => {
    if (!isProjectNote(note) || ids.has(note.id)) return false;
    ids.add(note.id);
    return true;
  });
}

export function updateProjectNote(
  notes: ProjectNote[],
  id: string,
  patch: Partial<Pick<ProjectNote, "content" | "priority">>,
  updatedAt: string,
): ProjectNote[] {
  return notes.map((note) =>
    note.id === id ? { ...note, ...patch, updatedAt } : note,
  );
}

/**
 * `id` 행을 `targetId` 행의 앞/뒤로 옮긴다. today-board 의 moveProject 와 같은
 * 엣지 기준 방식이라 드롭 위치를 행 위/아래 절반으로 판정해 그대로 넘길 수 있다.
 */
export function moveProjectNote(
  notes: ProjectNote[],
  id: string,
  targetId: string,
  position: "before" | "after" = "before",
): ProjectNote[] {
  if (id === targetId) return notes;

  const moved = notes.find((note) => note.id === id);
  if (!moved || !notes.some((note) => note.id === targetId)) return notes;

  const next = notes.filter((note) => note.id !== id);
  const at = next.findIndex((note) => note.id === targetId);
  next.splice(position === "before" ? at : at + 1, 0, moved);

  // 결과가 지금과 같으면 (바로 옆으로 옮긴 경우) 원래 배열을 그대로 돌려준다.
  if (next.every((note, index) => note === notes[index])) return notes;

  return next;
}
