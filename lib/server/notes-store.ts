/* -------------------------------------------------------------------------
 * 명심할 점 DB 접근. 라우트 핸들러만 이 파일을 부른다.
 *
 * lib 안에서는 상대 경로에 .ts 확장자를 붙여 가져온다 — `node --test` 가 같은
 * 파일을 그대로 읽어야 하기 때문이다.
 * ---------------------------------------------------------------------- */

import { prisma } from "../db.ts";
import type { ProjectNote, ProjectNotePriority } from "../project-notes.ts";

const PRIORITIES = new Set<ProjectNotePriority>([
  "urgent",
  "high",
  "normal",
  "low",
]);

type NoteRow = {
  id: string;
  content: string;
  priority: string;
  updatedAt: Date;
};

function toNote(row: NoteRow): ProjectNote {
  return {
    id: row.id,
    content: row.content,
    priority: PRIORITIES.has(row.priority as ProjectNotePriority)
      ? (row.priority as ProjectNotePriority)
      : "normal",
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotes(projectSlug: string): Promise<ProjectNote[]> {
  const rows = await prisma.projectNote.findMany({
    where: { projectSlug },
    orderBy: { position: "asc" },
  });
  return rows.map(toNote);
}

/** 새 항목은 표 맨 위에 들어간다. 그래서 지금 최소값보다 하나 작은 자리를 준다. */
export async function createNote(input: {
  id: string;
  projectSlug: string;
  now: string;
}): Promise<ProjectNote> {
  const first = await prisma.projectNote.findFirst({
    where: { projectSlug: input.projectSlug },
    orderBy: { position: "asc" },
    select: { position: true },
  });

  const row = await prisma.projectNote.create({
    data: {
      id: input.id,
      projectSlug: input.projectSlug,
      content: "",
      priority: "normal",
      position: first ? first.position - 1 : 0,
      updatedAt: new Date(input.now),
    },
  });
  return toNote(row);
}

export async function updateNote(
  id: string,
  patch: { content?: string; priority?: string },
  now: string,
): Promise<void> {
  const priority =
    patch.priority && PRIORITIES.has(patch.priority as ProjectNotePriority)
      ? patch.priority
      : undefined;

  await prisma.projectNote.update({
    where: { id },
    data: {
      content: patch.content,
      priority,
      updatedAt: new Date(now),
    },
  });
}

export async function deleteNote(id: string): Promise<void> {
  await prisma.projectNote.delete({ where: { id } });
}

/** 넘어온 순서대로 0부터 다시 매긴다. */
export async function reorderNotes(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.projectNote.updateMany({
        where: { id },
        data: { position: index },
      }),
    ),
  );
}
