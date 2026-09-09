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

/**
 * 화면에서 직접 만든 프로젝트. 플로우차트 레지스트리(`lib/flows/registry.ts`)에는
 * 넣지 않는다 — 거기 프로젝트는 카테고리·차트를 하나 이상 가져야 하고, 사이드바와
 * 차트 라우트가 전부 그 전제를 깔고 있다.
 */
export type CustomProject = {
  slug: string;
  title: string;
  createdAt: string;
};

export type TodayBoard = {
  /** 로컬 기준 YYYY-MM-DD. 이 값이 오늘과 다르면 롤오버 대상이다. */
  date: string;
  issues: Issue[];
  today: TodayItem[];
  customProjects: CustomProject[];
  /**
   * 사용자가 순서를 건드린 프로젝트의 slug 목록. 여기 없는 프로젝트는 기본
   * 순서(레지스트리 → 직접 추가)로 뒤에 붙는다 — 그래야 레지스트리에 프로젝트가
   * 새로 생겨도 목록에서 사라지지 않는다. 미분류는 담지 않고 항상 마지막이다.
   */
  projectOrder: string[];
  /** 헤더만 남기고 접어둔 프로젝트의 slug 목록. 미분류는 담지 않는다. */
  collapsedProjects: string[];
};

export type IssueGroup = {
  /** 어느 프로젝트에도 속하지 않는 이슈를 모은 그룹은 null. */
  slug: string | null;
  title: string;
  /** 이 그룹에 새 이슈를 넣을 수 있는지. 미분류 그룹은 false. */
  canAdd: boolean;
  /** 그룹(프로젝트) 자체를 지울 수 있는지. 직접 추가한 프로젝트만 true. */
  removable: boolean;
  issues: Issue[];
};

export const TODAY_BOARD_STORAGE_KEY = "project-management.today-board.v1";

/** dataTransfer 종류. 이슈 카드가 아닌 것을 끌어와도 드롭 영역이 반응하지 않게 한다. */
export const ISSUE_DRAG_TYPE = "application/x-today-issue";

/** 프로젝트 그룹 드래그. 이슈 드래그와 섞이지 않도록 종류를 나눈다. */
export const PROJECT_DRAG_TYPE = "application/x-today-project";

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
  return {
    date,
    issues: [],
    today: [],
    customProjects: [],
    projectOrder: [],
    collapsedProjects: [],
  };
}

/** 문자열만 남기고 빈 값·중복을 지운다. projectOrder 와 collapsedProjects 공용. */
function normalizeSlugList(value: unknown): string[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).filter((slug): slug is string => {
    if (typeof slug !== "string" || !slug || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
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

function isCustomProject(value: unknown): value is CustomProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.slug === "string" &&
    project.slug.length > 0 &&
    typeof project.title === "string" &&
    project.title.length > 0 &&
    typeof project.createdAt === "string"
  );
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

  // customProjects 는 나중에 생긴 필드다. 없던 저장값도 그대로 열려야 한다.
  const slugs = new Set<string>();
  const customProjects: CustomProject[] = (
    Array.isArray(raw.customProjects) ? raw.customProjects : []
  )
    .filter((item): item is CustomProject => {
      if (!isCustomProject(item) || slugs.has(item.slug)) return false;
      slugs.add(item.slug);
      return true;
    })
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      createdAt: item.createdAt,
    }));

  // projectOrder 와 collapsedProjects 도 나중에 생긴 필드다.
  return {
    date,
    issues,
    today,
    customProjects,
    projectOrder: normalizeSlugList(raw.projectOrder),
    collapsedProjects: normalizeSlugList(raw.collapsedProjects),
  };
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
    ...board,
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

export function addProject(
  board: TodayBoard,
  title: string,
  slug: string,
  now: string,
): TodayBoard {
  const trimmed = title.trim();
  if (!trimmed) return board;
  return {
    ...board,
    customProjects: [
      ...board.customProjects,
      { slug, title: trimmed, createdAt: now },
    ],
  };
}

/**
 * 프로젝트를 목록에서만 뺀다. 그 프로젝트의 이슈는 손대지 않는다 —
 * `groupIssuesByProject` 가 소속 없는 이슈를 미분류로 몰아주므로 이슈를 지울
 * 이유가 없다.
 */
export function removeProject(board: TodayBoard, slug: string): TodayBoard {
  if (!board.customProjects.some((project) => project.slug === slug)) {
    return board;
  }
  return {
    ...board,
    customProjects: board.customProjects.filter(
      (project) => project.slug !== slug,
    ),
  };
}

export function toggleProjectCollapsed(
  board: TodayBoard,
  slug: string,
): TodayBoard {
  const collapsed = board.collapsedProjects.includes(slug);
  return {
    ...board,
    collapsedProjects: collapsed
      ? board.collapsedProjects.filter((entry) => entry !== slug)
      : [...board.collapsedProjects, slug],
  };
}

/**
 * 이미 쓰는 프로젝트 이름인지. 레지스트리와 직접 추가한 목록 양쪽을 본다.
 * 빈 제목은 중복 판정 대상이 아니다 (추가 자체가 막히는 별개의 경우다).
 */
export function isProjectTitleTaken(
  board: TodayBoard,
  title: string,
  registryProjects: { slug: string; title: string }[],
): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  return (
    registryProjects.some((project) => project.title === trimmed) ||
    board.customProjects.some((project) => project.title === trimmed)
  );
}

/**
 * `projectOrder` 를 반영해 프로젝트를 늘어놓는다. 순서에 없는 프로젝트는 기본
 * 순서(레지스트리 → 직접 추가)로 뒤에 붙고, 순서에 남은 사라진 slug 는 무시한다.
 */
export function moveProject(
  board: TodayBoard,
  currentOrder: string[],
  slug: string,
  targetSlug: string,
  position: "before" | "after" = "before",
): TodayBoard {
  if (slug === targetSlug) return board;
  if (!currentOrder.includes(slug) || !currentOrder.includes(targetSlug)) {
    return board;
  }

  const next = currentOrder.filter((entry) => entry !== slug);
  const at = next.indexOf(targetSlug);
  next.splice(position === "before" ? at : at + 1, 0, slug);

  // 결과가 지금과 같으면 (바로 옆으로 옮긴 경우) 보드를 그대로 돌려준다.
  if (next.every((entry, index) => entry === currentOrder[index])) return board;

  return { ...board, projectOrder: next };
}

/**
 * 저장된 순서 → 나머지는 기본 순서 → 미분류 순으로 묶는다. 어느 프로젝트에도
 * 속하지 않는 이슈는 지우지 않고 미분류로 몬다 — 데이터를 잃는 것보다 낫다.
 * 미분류 그룹에는 새 이슈를 넣을 수 없다 (꺼내 쓰거나 지우기 위한 자리다).
 */
export function groupIssuesByProject(
  issues: Issue[],
  registryProjects: { slug: string; title: string }[],
  customProjects: CustomProject[] = [],
  projectOrder: string[] = [],
): IssueGroup[] {
  const groupFor = (
    project: { slug: string; title: string },
    removable: boolean,
  ): IssueGroup => ({
    slug: project.slug,
    title: project.title,
    canAdd: true,
    removable,
    issues: issues.filter((issue) => issue.projectSlug === project.slug),
  });

  const byDefault: IssueGroup[] = [
    ...registryProjects.map((project) => groupFor(project, false)),
    ...customProjects.map((project) => groupFor(project, true)),
  ];

  const ordered = projectOrder
    .map((slug) => byDefault.find((group) => group.slug === slug))
    .filter((group): group is IssueGroup => group !== undefined);
  const rest = byDefault.filter((group) => !projectOrder.includes(group.slug!));
  const groups: IssueGroup[] = [...ordered, ...rest];

  const known = new Set([
    ...registryProjects.map((project) => project.slug),
    ...customProjects.map((project) => project.slug),
  ]);
  const ungrouped = issues.filter((issue) => !known.has(issue.projectSlug));
  if (ungrouped.length > 0) {
    groups.push({
      slug: null,
      title: UNGROUPED_TITLE,
      canAdd: false,
      removable: false,
      issues: ungrouped,
    });
  }

  return groups;
}

/** "2026-09-08" → "09/08". 형식이 어긋나면 받은 값을 그대로 쓴다. */
function formatMonthDay(date: string): string {
  if (!DATE_PATTERN.test(date)) return date;
  const [, month, day] = date.split("-");
  return `${month}/${day}`;
}

/**
 * 완료한 항목만 프로젝트별로 묶어 붙여넣기용 작업내용 텍스트를 만든다.
 * 순서와 미분류 처리는 화면과 같게 `groupIssuesByProject` 를 그대로 쓴다.
 * 완료한 항목이 하나도 없으면 빈 문자열.
 */
export function formatWorklog(
  board: TodayBoard,
  registryProjects: { slug: string; title: string }[],
): string {
  const done = board.today.filter((item) => item.done);
  if (done.length === 0) return "";

  const groups = groupIssuesByProject(
    done,
    registryProjects,
    board.customProjects,
    board.projectOrder,
  );

  const lines = [`${formatMonthDay(board.date)} 작업내용`];
  for (const group of groups) {
    if (group.issues.length === 0) continue;
    lines.push(`\`${group.title}\``);
    for (const issue of group.issues) lines.push(`- ${issue.title}`);
  }
  return lines.join("\n");
}
