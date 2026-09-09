/* -------------------------------------------------------------------------
 * 오늘의 할 일 보드 — 상태 전이는 전부 여기 순수 함수로 둔다.
 *
 * 불변식:
 *  - 한 항목(id)은 issues 와 today 중 한쪽에만 있다.
 *  - 모든 함수는 입력을 변형하지 않는다. 바뀔 게 없으면 받은 보드를 그대로
 *    돌려준다 (React 가 참조 비교로 리렌더를 건너뛸 수 있게).
 *  - id 와 시각은 호출부가 넘긴다 — 그래야 테스트가 결정적이다.
 * ---------------------------------------------------------------------- */

export type Issue = {
  id: string;
  projectSlug: string;
  title: string;
  createdAt: string;
};

export type TodayItem = Issue & { done: boolean };

export type TodayBoard = {
  /** 로컬 기준 YYYY-MM-DD. 이 값이 오늘과 다르면 롤오버 대상이다. */
  date: string;
  issues: Issue[];
  today: TodayItem[];
};

export type IssueGroup = {
  /** 레지스트리에 없는 이슈를 모은 그룹은 null. */
  slug: string | null;
  title: string;
  /** 이 그룹에 새 이슈를 넣을 수 있는지. 미분류 그룹은 false. */
  canAdd: boolean;
  issues: Issue[];
};

export const TODAY_BOARD_STORAGE_KEY = "project-management.today-board.v1";

/** dataTransfer 종류. 이슈 카드가 아닌 것을 끌어와도 드롭 영역이 반응하지 않게 한다. */
export const ISSUE_DRAG_TYPE = "application/x-today-issue";

export const UNGROUPED_TITLE = "미분류";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 로컬 시간 기준 YYYY-MM-DD. `toISOString()` 은 UTC 라 한국 시간 오전 9시
 * 이전에 날짜가 하루 밀린다 — 그래서 직접 조립한다.
 */
export function todayDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createBoard(date: string): TodayBoard {
  return { date, issues: [], today: [] };
}

/** 여분 필드를 떨어뜨린다. today → issues 로 옮길 때 done 이 따라가지 않게 한다. */
function toIssue(value: Issue): Issue {
  return {
    id: value.id,
    projectSlug: value.projectSlug,
    title: value.title,
    createdAt: value.createdAt,
  };
}

function isIssue(value: unknown): value is Issue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const issue = value as Record<string, unknown>;
  return (
    typeof issue.id === "string" &&
    issue.id.length > 0 &&
    typeof issue.projectSlug === "string" &&
    typeof issue.title === "string" &&
    typeof issue.createdAt === "string"
  );
}

function isTodayItem(value: unknown): value is TodayItem {
  return isIssue(value) && typeof (value as TodayItem).done === "boolean";
}

export function normalizeTodayBoard(
  value: unknown,
  fallbackDate: string,
): TodayBoard {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createBoard(fallbackDate);
  }
  const raw = value as Record<string, unknown>;
  const date =
    typeof raw.date === "string" && DATE_PATTERN.test(raw.date)
      ? raw.date
      : fallbackDate;

  // today 를 먼저 훑는다. 두 목록에 같은 id 가 있으면 오늘의 할 일이 이긴다
  // (사용자가 마지막으로 손댄 쪽이라고 본다).
  const seen = new Set<string>();

  const today: TodayItem[] = (Array.isArray(raw.today) ? raw.today : [])
    .filter((item): item is TodayItem => {
      if (!isTodayItem(item) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item) => ({ ...toIssue(item), done: item.done }));

  const issues: Issue[] = (Array.isArray(raw.issues) ? raw.issues : [])
    .filter((item): item is Issue => {
      if (!isIssue(item) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map(toIssue);

  return { date, issues, today };
}

/**
 * 날짜가 넘어갔으면 완료 항목은 버리고 미완료 항목은 풀 뒤로 되돌린다.
 * 과거 기록은 남기지 않는다 — 오늘의 할 일은 매일 빈 상태로 시작한다.
 */
export function rollOverBoard(
  board: TodayBoard,
  todayDate: string,
): TodayBoard {
  if (board.date === todayDate) return board;
  const carried = board.today.filter((item) => !item.done).map(toIssue);
  return {
    date: todayDate,
    issues: [...board.issues, ...carried],
    today: [],
  };
}

export function addIssue(
  board: TodayBoard,
  projectSlug: string,
  title: string,
  id: string,
  now: string,
): TodayBoard {
  const trimmed = title.trim();
  if (!trimmed) return board;
  return {
    ...board,
    issues: [
      ...board.issues,
      { id, projectSlug, title: trimmed, createdAt: now },
    ],
  };
}

export function removeIssue(board: TodayBoard, issueId: string): TodayBoard {
  if (!board.issues.some((issue) => issue.id === issueId)) return board;
  return {
    ...board,
    issues: board.issues.filter((issue) => issue.id !== issueId),
  };
}

export function sendToToday(board: TodayBoard, issueId: string): TodayBoard {
  const issue = board.issues.find((item) => item.id === issueId);
  if (!issue) return board;
  return {
    ...board,
    issues: board.issues.filter((item) => item.id !== issueId),
    today: [...board.today, { ...toIssue(issue), done: false }],
  };
}

export function returnToPool(board: TodayBoard, itemId: string): TodayBoard {
  const item = board.today.find((entry) => entry.id === itemId);
  if (!item) return board;
  return {
    ...board,
    today: board.today.filter((entry) => entry.id !== itemId),
    issues: [...board.issues, toIssue(item)],
  };
}

export function toggleDone(board: TodayBoard, itemId: string): TodayBoard {
  if (!board.today.some((item) => item.id === itemId)) return board;
  return {
    ...board,
    today: board.today.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    ),
  };
}

/**
 * 레지스트리 순서로 묶는다. 레지스트리에서 사라진 프로젝트의 이슈는 지우지 않고
 * 미분류 그룹으로 몬다 — 데이터를 잃는 것보다 낫다. 그 그룹에는 새 이슈를
 * 넣을 수 없다 (꺼내 쓰거나 지우기 위한 자리다).
 */
export function groupIssuesByProject(
  issues: Issue[],
  projects: { slug: string; title: string }[],
): IssueGroup[] {
  const known = new Set(projects.map((project) => project.slug));
  const groups: IssueGroup[] = projects.map((project) => ({
    slug: project.slug,
    title: project.title,
    canAdd: true,
    issues: issues.filter((issue) => issue.projectSlug === project.slug),
  }));

  const ungrouped = issues.filter((issue) => !known.has(issue.projectSlug));
  if (ungrouped.length > 0) {
    groups.push({
      slug: null,
      title: UNGROUPED_TITLE,
      canAdd: false,
      issues: ungrouped,
    });
  }

  return groups;
}
