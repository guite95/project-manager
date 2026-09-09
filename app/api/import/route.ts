import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api-types";
import { normalizeProjectNotes, type ProjectNote } from "@/lib/project-notes";
import { importLegacy, isBoardEmpty } from "@/lib/server/board-store";
import { normalizeTodayBoard, todayDateString } from "@/lib/today-board";

export async function POST(request: Request) {
  if (!(await isBoardEmpty())) {
    return jsonError("서버에 이미 내용이 있어 이관하지 않았습니다.", 409);
  }

  const body = await readJson(request);
  const board = body.board ? normalizeTodayBoard(body.board) : null;

  const notes: { projectSlug: string; notes: ProjectNote[] }[] = [];
  if (Array.isArray(body.notes)) {
    for (const entry of body.notes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as { projectSlug?: unknown; notes?: unknown };
      if (typeof record.projectSlug !== "string") continue;
      const list = normalizeProjectNotes(record.notes);
      if (list.length > 0) {
        notes.push({ projectSlug: record.projectSlug, notes: list });
      }
    }
  }

  await importLegacy({
    board,
    notes,
    today: todayDateString(new Date()),
    now: new Date().toISOString(),
  });

  return new NextResponse(null, { status: 204 });
}
