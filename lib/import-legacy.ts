/* -------------------------------------------------------------------------
 * 서버 저장으로 넘어오기 전 브라우저에 쌓인 값을 읽어 올릴 모양으로 만든다.
 *
 * 저장소를 인자로 받는다. 그래야 테스트가 가짜 저장소를 넣을 수 있다.
 * lib 안에서는 상대 경로에 .ts 확장자를 붙여 가져온다.
 * ---------------------------------------------------------------------- */

import {
  normalizeProjectNotes,
  projectNotesStorageKey,
  type ProjectNote,
} from "./project-notes.ts";
import {
  normalizeTodayBoard,
  TODAY_BOARD_STORAGE_KEY,
  type TodayBoard,
} from "./today-board.ts";

export type LegacyPayload = {
  board: TodayBoard | null;
  notes: { projectSlug: string; notes: ProjectNote[] }[];
};

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readLegacyData(
  storage: Pick<Storage, "getItem">,
  projectSlugs: string[],
): LegacyPayload {
  const rawBoard = parse(storage.getItem(TODAY_BOARD_STORAGE_KEY));
  const board = rawBoard ? normalizeTodayBoard(rawBoard) : null;

  const notes: LegacyPayload["notes"] = [];
  for (const projectSlug of projectSlugs) {
    const parsed = parse(storage.getItem(projectNotesStorageKey(projectSlug)));
    const list = normalizeProjectNotes(parsed);
    if (list.length > 0) notes.push({ projectSlug, notes: list });
  }

  return { board, notes };
}

/** 올릴 내용이 실제로 있는지. 빈 보드만 있으면 올리지 않는다. */
export function hasLegacyData(payload: LegacyPayload): boolean {
  const board = payload.board;
  const boardHasSomething = Boolean(
    board &&
      (board.issues.length > 0 ||
        board.today.length > 0 ||
        board.customProjects.length > 0),
  );
  return boardHasSomething || payload.notes.length > 0;
}

export function clearLegacyData(
  storage: Pick<Storage, "removeItem">,
  projectSlugs: string[],
): void {
  storage.removeItem(TODAY_BOARD_STORAGE_KEY);
  for (const projectSlug of projectSlugs) {
    storage.removeItem(projectNotesStorageKey(projectSlug));
  }
}
