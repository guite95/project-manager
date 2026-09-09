# 오늘의 할 일 보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트별로 쌓인 이슈를 끌어다 놓아 오늘의 할 일로 만들고 체크할 수 있는 `/today` 페이지를 만든다.

**Architecture:** 상태 전이는 전부 `lib/today-board.ts` 의 순수 함수로 두고 `node --test` 로 검증한다. 화면은 보드 컨테이너 하나가 상태와 `localStorage` 를 소유하고, 좌우 두 영역은 props 만 받는 프레젠테이션 컴포넌트로 나눈다. 드래그앤드롭은 브라우저 기본 HTML5 DnD 를 쓰고 모든 이동에 버튼 경로를 함께 둔다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 (`--bi-*` 토큰), `react-icons` (Heroicons v1 아웃라인), `node:test`

**Spec:** `docs/superpowers/specs/2026-09-09-today-board-design.md`

## Global Constraints

- 새 npm 의존성을 추가하지 않는다. 드래그앤드롭은 브라우저 기본 `draggable` + `dataTransfer` 로만 구현한다.
- 색은 `app/globals.css` 에 이미 있는 `--bi-*` 토큰만 쓴다. 새 토큰을 추가하지 않는다.
- 저장 키는 전역 하나: `project-management.today-board.v1`
- 날짜 문자열은 로컬 시간 기준 `YYYY-MM-DD` 다. UTC 로 계산하지 않는다.
- 순수 함수는 입력을 변형하지 않고 새 보드를 반환한다. `id` 와 `now` 는 호출부가 넘긴다.
- 사용자에게 보이는 문구는 전부 한국어다.
- 드래그로 되는 모든 동작에 버튼 경로가 있어야 한다.
- 커밋 메시지에 `Co-Authored-By` 트레일러를 넣지 않는다.

---

### Task 1: 보드 상태 전이 로직

**Files:**
- Create: `lib/today-board.ts`
- Test: `lib/today-board.test.mjs`

**Interfaces:**
- Consumes: 없음 (이 태스크가 첫 번째다)
- Produces:
  - `type Issue = { id: string; projectSlug: string; title: string; createdAt: string }`
  - `type TodayItem = Issue & { done: boolean }`
  - `type TodayBoard = { date: string; issues: Issue[]; today: TodayItem[] }`
  - `type IssueGroup = { slug: string | null; title: string; canAdd: boolean; issues: Issue[] }`
  - `TODAY_BOARD_STORAGE_KEY: string`
  - `ISSUE_DRAG_TYPE: string`
  - `UNGROUPED_TITLE: string`
  - `todayDateString(date: Date): string`
  - `createBoard(date: string): TodayBoard`
  - `normalizeTodayBoard(value: unknown, fallbackDate: string): TodayBoard`
  - `rollOverBoard(board: TodayBoard, todayDate: string): TodayBoard`
  - `addIssue(board, projectSlug: string, title: string, id: string, now: string): TodayBoard`
  - `removeIssue(board, issueId: string): TodayBoard`
  - `sendToToday(board, issueId: string): TodayBoard`
  - `returnToPool(board, itemId: string): TodayBoard`
  - `toggleDone(board, itemId: string): TodayBoard`
  - `groupIssuesByProject(issues: Issue[], projects: { slug: string; title: string }[]): IssueGroup[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/today-board.test.mjs` 를 만든다. 기존 `lib/project-notes.test.mjs` 와 같이 `.ts` 를 직접 import 한다 (Node 26 의 타입 스트리핑).

```js
import assert from "node:assert/strict";
import test from "node:test";

const board = await import("./today-board.ts").catch(() => null);

function makeBoard(overrides = {}) {
  return {
    date: "2026-09-09",
    issues: [],
    today: [],
    ...overrides,
  };
}

function issue(id, projectSlug = "tns", title = `이슈 ${id}`) {
  return { id, projectSlug, title, createdAt: "2026-09-09T00:00:00.000Z" };
}

test("로컬 시간 기준으로 날짜 문자열을 만든다", () => {
  assert.ok(board, "today-board 모듈이 필요하다");
  // 한국 시간 오전 8시. UTC 로 계산하면 하루 밀린다.
  assert.equal(board.todayDateString(new Date(2026, 8, 9, 8, 0, 0)), "2026-09-09");
  assert.equal(board.todayDateString(new Date(2026, 0, 1, 0, 0, 0)), "2026-01-01");
});

test("저장 키는 프로젝트를 나누지 않고 하나다", () => {
  assert.equal(
    board.TODAY_BOARD_STORAGE_KEY,
    "project-management.today-board.v1",
  );
});

test("날짜가 바뀌면 완료 항목은 버리고 미완료 항목만 풀로 되돌린다", () => {
  const before = makeBoard({
    date: "2026-09-08",
    issues: [issue("a")],
    today: [
      { ...issue("b"), done: true },
      { ...issue("c"), done: false },
    ],
  });

  const after = board.rollOverBoard(before, "2026-09-09");

  assert.equal(after.date, "2026-09-09");
  assert.deepEqual(after.today, []);
  assert.deepEqual(
    after.issues.map((i) => i.id),
    ["a", "c"],
  );
  // 풀로 돌아온 항목에는 done 이 남지 않는다
  assert.equal("done" in after.issues[1], false);
  // 입력을 변형하지 않는다
  assert.equal(before.today.length, 2);
});

test("같은 날짜면 롤오버가 아무것도 바꾸지 않는다", () => {
  const before = makeBoard({
    today: [{ ...issue("b"), done: true }],
  });

  assert.equal(board.rollOverBoard(before, "2026-09-09"), before);
});

test("오늘로 보냈다가 되돌리면 항목이 풀에만 남는다", () => {
  const start = makeBoard({ issues: [issue("a"), issue("b")] });

  const sent = board.sendToToday(start, "a");
  assert.deepEqual(sent.issues.map((i) => i.id), ["b"]);
  assert.deepEqual(sent.today.map((i) => i.id), ["a"]);
  assert.equal(sent.today[0].done, false);

  const back = board.returnToPool(sent, "a");
  assert.deepEqual(back.today, []);
  assert.deepEqual(back.issues.map((i) => i.id), ["b", "a"]);
  assert.equal("done" in back.issues[1], false);
});

test("없는 id 로 옮기면 보드를 그대로 돌려준다", () => {
  const start = makeBoard({ issues: [issue("a")] });
  assert.equal(board.sendToToday(start, "없음"), start);
  assert.equal(board.returnToPool(start, "없음"), start);
});

test("체크는 대상 항목만 바꾼다", () => {
  const start = makeBoard({
    today: [
      { ...issue("a"), done: false },
      { ...issue("b"), done: false },
    ],
  });

  const after = board.toggleDone(start, "a");

  assert.equal(after.today[0].done, true);
  assert.equal(after.today[1].done, false);
  assert.equal(start.today[0].done, false);
});

test("이슈 추가는 제목을 다듬고, 공백뿐이면 무시한다", () => {
  const start = makeBoard();

  const added = board.addIssue(
    start,
    "tns",
    "  가격표 확인  ",
    "id-1",
    "2026-09-09T01:00:00.000Z",
  );
  assert.equal(added.issues.length, 1);
  assert.equal(added.issues[0].title, "가격표 확인");
  assert.equal(added.issues[0].projectSlug, "tns");
  assert.equal(added.issues[0].createdAt, "2026-09-09T01:00:00.000Z");

  assert.equal(
    board.addIssue(start, "tns", "   ", "id-2", "2026-09-09T01:00:00.000Z"),
    start,
  );
});

test("이슈 삭제는 풀에서만 지운다", () => {
  const start = makeBoard({
    issues: [issue("a")],
    today: [{ ...issue("b"), done: false }],
  });

  const after = board.removeIssue(start, "a");
  assert.deepEqual(after.issues, []);
  assert.equal(after.today.length, 1);
});

test("깨진 저장값에서 유효한 항목만 살리고 중복 id 를 지운다", () => {
  const normalized = board.normalizeTodayBoard(
    {
      date: "엉망",
      issues: [
        issue("a"),
        issue("a"), // 중복
        { id: "b" }, // 형태 미달
        null,
        { ...issue("c"), done: true }, // 여분 필드는 떨어져 나간다
      ],
      today: [{ ...issue("d"), done: false }, issue("e")],
    },
    "2026-09-09",
  );

  assert.equal(normalized.date, "2026-09-09");
  assert.deepEqual(normalized.issues.map((i) => i.id), ["a", "c"]);
  assert.equal("done" in normalized.issues[1], false);
  // done 이 없는 today 항목은 버린다
  assert.deepEqual(normalized.today.map((i) => i.id), ["d"]);
});

test("두 목록에 겹치는 id 는 오늘의 할 일을 남긴다", () => {
  const normalized = board.normalizeTodayBoard(
    {
      date: "2026-09-09",
      issues: [issue("a")],
      today: [{ ...issue("a"), done: true }],
    },
    "2026-09-09",
  );

  assert.deepEqual(normalized.issues, []);
  assert.deepEqual(normalized.today.map((i) => i.id), ["a"]);
});

test("저장값이 객체가 아니면 빈 보드를 만든다", () => {
  for (const bad of [null, 5, "문자열", []]) {
    const normalized = board.normalizeTodayBoard(bad, "2026-09-09");
    assert.deepEqual(normalized, { date: "2026-09-09", issues: [], today: [] });
  }
});

test("이슈를 레지스트리 순서로 묶고 모르는 프로젝트는 미분류로 몬다", () => {
  const groups = board.groupIssuesByProject(
    [issue("a", "tns"), issue("b", "common"), issue("c", "사라진프로젝트")],
    [
      { slug: "common", title: "공통" },
      { slug: "tns", title: "티앤에스" },
    ],
  );

  assert.deepEqual(
    groups.map((g) => [g.slug, g.title, g.canAdd, g.issues.map((i) => i.id)]),
    [
      ["common", "공통", true, ["b"]],
      ["tns", "티앤에스", true, ["a"]],
      [null, "미분류", false, ["c"]],
    ],
  );
});

test("모르는 프로젝트의 이슈가 없으면 미분류 그룹을 만들지 않는다", () => {
  const groups = board.groupIssuesByProject(
    [issue("a", "tns")],
    [{ slug: "tns", title: "티앤에스" }],
  );

  assert.deepEqual(groups.map((g) => g.slug), ["tns"]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test lib/today-board.test.mjs`
Expected: FAIL — `today-board 모듈이 필요하다` (모듈이 아직 없어 `board` 가 `null`)

- [ ] **Step 3: 구현한다**

`lib/today-board.ts`:

```ts
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test lib/today-board.test.mjs`
Expected: PASS — 14 tests, 0 fail

- [ ] **Step 5: 커밋한다**

```bash
git add lib/today-board.ts lib/today-board.test.mjs
git commit -m "feat: 오늘의 할 일 보드 상태 전이 로직 추가"
```

---

### Task 2: 화면과 라우트

버튼만으로 전체 흐름이 도는 화면을 만든다. 드래그는 Task 3 에서 얹는다. 반쪽 화면을 남기지 않으려고 좌우 두 영역을 한 태스크에 넣는다.

**Files:**
- Create: `components/today-board/issue-pool.tsx`
- Create: `components/today-board/today-list.tsx`
- Create: `components/today-board/today-board.tsx`
- Create: `app/today/layout.tsx`
- Create: `app/today/page.tsx`

**Interfaces:**
- Consumes: Task 1 의 `Issue`, `IssueGroup`, `TodayItem`, `TodayBoard`, `TODAY_BOARD_STORAGE_KEY`, `UNGROUPED_TITLE`, `todayDateString`, `createBoard`, `normalizeTodayBoard`, `rollOverBoard`, `addIssue`, `removeIssue`, `sendToToday`, `returnToPool`, `toggleDone`, `groupIssuesByProject`
- Consumes: `@/lib/flows/registry` 의 `flowProjects`, `@/components/shell/app-shell` 의 `AppShell`, `@/components/erp/page-header` 의 `PageHeader`, `@/components/erp/button` 의 `Button`, `@/components/erp/badge` 의 `Badge`
- Produces:
  - `IssuePool` — props `{ groups: IssueGroup[]; onAdd(projectSlug: string, title: string): void; onRemove(issue: Issue): void; onSendToToday(issue: Issue): void }`
  - `TodayList` — props `{ date: string; items: TodayItem[]; projectTitles: Record<string, string>; onToggle(item: TodayItem): void; onReturn(item: TodayItem): void }`
  - `TodayBoardView` — props 없음. `"use client"`. 보드 상태와 `localStorage` 를 소유한다.

- [ ] **Step 1: 이슈 풀 컴포넌트를 만든다**

`components/today-board/issue-pool.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  HiOutlineArrowRight,
  HiOutlinePlus,
  HiOutlineTrash,
} from "react-icons/hi";
import { Button } from "@/components/erp/button";
import type { Issue, IssueGroup } from "@/lib/today-board";

type IssuePoolProps = {
  groups: IssueGroup[];
  onAdd: (projectSlug: string, title: string) => void;
  onRemove: (issue: Issue) => void;
  onSendToToday: (issue: Issue) => void;
};

export function IssuePool({
  groups,
  onAdd,
  onRemove,
  onSendToToday,
}: IssuePoolProps) {
  return (
    <section
      aria-labelledby="issue-pool-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <h3
        className="text-[13px] font-semibold text-[var(--bi-fg)]"
        id="issue-pool-heading"
      >
        프로젝트 이슈
      </h3>
      {groups.map((group) => (
        <ProjectGroup
          group={group}
          key={group.slug ?? "__ungrouped__"}
          onAdd={onAdd}
          onRemove={onRemove}
          onSendToToday={onSendToToday}
        />
      ))}
    </section>
  );
}

function ProjectGroup({
  group,
  onAdd,
  onRemove,
  onSendToToday,
}: { group: IssueGroup } & Omit<IssuePoolProps, "groups">) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!group.slug || !draft.trim()) return;
    onAdd(group.slug, draft);
    setDraft("");
  };

  return (
    <div className="overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] px-3 py-2">
        <span className="truncate text-[12px] font-semibold text-[var(--bi-fg)]">
          {group.title}
        </span>
        <span className="shrink-0 text-[11px] text-[var(--bi-muted)]">
          {group.issues.length}건
        </span>
      </div>

      <ul className="m-0 list-none p-0">
        {group.issues.length === 0 ? (
          <li className="px-3 py-4 text-center text-[11px] text-[var(--bi-muted)]">
            쌓인 이슈가 없습니다.
          </li>
        ) : (
          group.issues.map((issue) => (
            <li
              className="flex items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0"
              key={issue.id}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--bi-fg)]">
                {issue.title}
              </span>
              <button
                aria-label={`${issue.title} 오늘의 할 일로 보내기`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                onClick={() => onSendToToday(issue)}
                title="오늘의 할 일로"
                type="button"
              >
                <HiOutlineArrowRight aria-hidden size={15} />
              </button>
              <button
                aria-label={`${issue.title} 삭제`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-error)]/10 hover:text-[var(--bi-error)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                onClick={() => onRemove(issue)}
                title="삭제"
                type="button"
              >
                <HiOutlineTrash aria-hidden size={15} />
              </button>
            </li>
          ))
        )}
      </ul>

      {group.canAdd && group.slug ? (
        <form
          className="flex items-center gap-2 border-t border-[var(--bi-border)] px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            aria-label={`${group.title} 이슈 추가`}
            className="h-[30px] min-w-0 flex-1 rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 text-[12px] text-[var(--bi-fg)] outline-none placeholder:text-[var(--bi-muted)] hover:border-[var(--bi-border-strong)] focus:border-[var(--bi-accent)]"
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="새 이슈"
            value={draft}
          />
          <Button
            disabled={!draft.trim()}
            size="sm"
            type="submit"
            variant="secondary"
          >
            <HiOutlinePlus aria-hidden size={14} />
            추가
          </Button>
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 오늘의 할 일 컴포넌트를 만든다**

`components/today-board/today-list.tsx`:

```tsx
"use client";

import { HiOutlineArrowLeft } from "react-icons/hi";
import { Badge } from "@/components/erp/badge";
import { UNGROUPED_TITLE, type TodayItem } from "@/lib/today-board";

type TodayListProps = {
  date: string;
  items: TodayItem[];
  projectTitles: Record<string, string>;
  onToggle: (item: TodayItem) => void;
  onReturn: (item: TodayItem) => void;
};

/** "2026-09-09" → "9월 9일 (수)". 클라이언트에서만 렌더하므로 하이드레이션 걱정이 없다. */
function formatBoardDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

export function TodayList({
  date,
  items,
  projectTitles,
  onToggle,
  onReturn,
}: TodayListProps) {
  const doneCount = items.filter((item) => item.done).length;

  return (
    <section
      aria-labelledby="today-list-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3
          className="text-[13px] font-semibold text-[var(--bi-fg)]"
          id="today-list-heading"
        >
          오늘의 할 일
        </h3>
        <span className="shrink-0 text-[11px] text-[var(--bi-muted)]">
          {formatBoardDate(date)} · {doneCount}/{items.length} 완료
        </span>
      </div>

      <div className="rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
        {items.length === 0 ? (
          <p className="m-0 px-3 py-10 text-center text-[11px] text-[var(--bi-muted)]">
            오른쪽 이슈를 끌어다 놓으세요.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li
                className="flex items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0"
                key={item.id}
              >
                <input
                  checked={item.done}
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--bi-accent)]"
                  id={`today-item-${item.id}`}
                  onChange={() => onToggle(item)}
                  type="checkbox"
                />
                <label
                  className={`min-w-0 flex-1 truncate text-[12px] ${
                    item.done
                      ? "text-[var(--bi-muted)] line-through"
                      : "text-[var(--bi-fg)]"
                  }`}
                  htmlFor={`today-item-${item.id}`}
                >
                  {item.title}
                </label>
                <span className="shrink-0">
                  <Badge variant="neutral">
                    {projectTitles[item.projectSlug] ?? UNGROUPED_TITLE}
                  </Badge>
                </span>
                <button
                  aria-label={`${item.title} 이슈 목록으로 되돌리기`}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[var(--bi-muted)] outline-none transition hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]"
                  onClick={() => onReturn(item)}
                  title="되돌리기"
                  type="button"
                >
                  <HiOutlineArrowLeft aria-hidden size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 보드 컨테이너를 만든다**

`components/today-board/today-board.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IssuePool } from "@/components/today-board/issue-pool";
import { TodayList } from "@/components/today-board/today-list";
import { flowProjects } from "@/lib/flows/registry";
import {
  addIssue,
  createBoard,
  groupIssuesByProject,
  normalizeTodayBoard,
  removeIssue,
  returnToPool,
  rollOverBoard,
  sendToToday,
  todayDateString,
  toggleDone,
  TODAY_BOARD_STORAGE_KEY,
  type Issue,
  type TodayBoard,
  type TodayItem,
} from "@/lib/today-board";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `issue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TodayBoardView() {
  // null 은 "아직 저장값을 안 읽음". 서버 렌더와 어긋나지 않도록 첫 렌더에서는
  // 안내만 보여준다.
  const [board, setBoard] = useState<TodayBoard | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const loadedRef = useRef(false);

  // 저장값을 읽고 그 자리에서 날짜 롤오버를 판정한다. 자정을 넘겨 켜둔 탭은
  // 여기서 정리되지 않고 다음에 열 때 정리된다 (타이머로 감시하지 않는다).
  useEffect(() => {
    const today = todayDateString(new Date());
    let next = createBoard(today);
    try {
      const saved = window.localStorage.getItem(TODAY_BOARD_STORAGE_KEY);
      if (saved) {
        next = rollOverBoard(normalizeTodayBoard(JSON.parse(saved), today), today);
      }
    } catch {
      setStorageError("저장된 내용을 불러오지 못했습니다.");
    }
    setBoard(next);
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!loadedRef.current || !board) return;
    try {
      window.localStorage.setItem(
        TODAY_BOARD_STORAGE_KEY,
        JSON.stringify(board),
      );
      setStorageError(null);
    } catch {
      setStorageError("이 브라우저에 내용을 저장할 수 없습니다.");
    }
  }, [board]);

  const projects = useMemo(
    () => flowProjects.map(({ slug, title }) => ({ slug, title })),
    [],
  );

  const projectTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const project of projects) map[project.slug] = project.title;
    return map;
  }, [projects]);

  const groups = useMemo(
    () => groupIssuesByProject(board?.issues ?? [], projects),
    [board?.issues, projects],
  );

  const handleAdd = (projectSlug: string, title: string) => {
    setBoard((current) =>
      current
        ? addIssue(current, projectSlug, title, createId(), new Date().toISOString())
        : current,
    );
  };

  const handleRemove = (issue: Issue) => {
    if (!window.confirm(`“${issue.title}” 이슈를 삭제할까요?`)) return;
    setBoard((current) => (current ? removeIssue(current, issue.id) : current));
    setAnnouncement(`${issue.title} 이슈를 삭제했습니다.`);
  };

  const handleSendToToday = (issue: Issue) => {
    setBoard((current) => (current ? sendToToday(current, issue.id) : current));
    setAnnouncement(`${issue.title} 이슈를 오늘의 할 일로 옮겼습니다.`);
  };

  const handleReturn = (item: TodayItem) => {
    setBoard((current) => (current ? returnToPool(current, item.id) : current));
    setAnnouncement(`${item.title} 항목을 이슈 목록으로 되돌렸습니다.`);
  };

  const handleToggle = (item: TodayItem) => {
    setBoard((current) => (current ? toggleDone(current, item.id) : current));
    setAnnouncement(
      item.done
        ? `${item.title} 항목의 완료를 취소했습니다.`
        : `${item.title} 항목을 완료했습니다.`,
    );
  };

  if (!board) {
    return (
      <p className="px-6 py-10 text-center text-[12px] text-[var(--bi-muted)]">
        저장된 내용을 불러오는 중입니다.
      </p>
    );
  }

  return (
    <div className="px-6 py-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <IssuePool
          groups={groups}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onSendToToday={handleSendToToday}
        />
        <TodayList
          date={board.date}
          items={board.today}
          onReturn={handleReturn}
          onToggle={handleToggle}
          projectTitles={projectTitles}
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {storageError ? (
        <p aria-live="polite" className="mt-3 text-[11px] text-[var(--bi-error)]">
          {storageError}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 라우트를 만든다**

`app/today/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

export default function TodayLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

`app/today/page.tsx`:

```tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { TodayBoardView } from "@/components/today-board/today-board";

export const metadata: Metadata = {
  title: "오늘의 할 일 — 프로젝트 매니지먼트",
  description: "프로젝트별로 쌓인 이슈를 오늘 할 일로 옮겨 체크합니다.",
};

export default function TodayPage() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description="프로젝트별로 쌓인 이슈를 오늘 할 일로 옮겨 체크합니다. 내용은 이 브라우저에 자동 저장됩니다."
        title="오늘의 할 일"
      />
      <TodayBoardView />
    </div>
  );
}
```

- [ ] **Step 5: 타입 검사와 화면을 확인한다**

Run: `pnpm typecheck`
Expected: 오류 없음

Run: `pnpm dev` 후 `http://localhost:30001/today`
Expected: 왼쪽에 `공통`·`티앤에스` 섹션, 오른쪽에 오늘의 할 일. 이슈를 추가하고 `→` 버튼으로 오른쪽에 보내고, 체크하면 취소선과 `1/2 완료` 가 반영된다. `←` 로 되돌리면 원래 프로젝트 그룹으로 간다. 새로고침해도 유지된다.

- [ ] **Step 6: 커밋한다**

```bash
git add app/today components/today-board
git commit -m "feat: 오늘의 할 일 화면과 라우트 추가"
```

---

### Task 3: 드래그앤드롭

**Files:**
- Modify: `components/today-board/issue-pool.tsx`
- Modify: `components/today-board/today-list.tsx`
- Modify: `components/today-board/today-board.tsx`

**Interfaces:**
- Consumes: Task 1 의 `ISSUE_DRAG_TYPE`, Task 2 의 `IssuePool`·`TodayList`·`TodayBoardView`
- Produces: `TodayList` props 에 `onDropIssue(issueId: string): void` 추가

- [ ] **Step 1: 이슈 카드를 끌 수 있게 한다**

`components/today-board/issue-pool.tsx` 의 import 를 바꾼다.

```tsx
import { ISSUE_DRAG_TYPE, type Issue, type IssueGroup } from "@/lib/today-board";
```

이슈 `<li>` 에 드래그 속성을 붙인다 (`cursor-grab` 으로 끌 수 있음을 알린다).

```tsx
            <li
              className="flex cursor-grab items-center gap-2 border-b border-[var(--bi-border)] px-3 py-2 last:border-b-0 active:cursor-grabbing"
              draggable
              key={issue.id}
              onDragStart={(event) => {
                event.dataTransfer.setData(ISSUE_DRAG_TYPE, issue.id);
                // text/plain 도 함께 넣는다. 표준 타입이 없으면 드래그 이미지를
                // 만들지 않는 브라우저가 있다.
                event.dataTransfer.setData("text/plain", issue.title);
                event.dataTransfer.effectAllowed = "move";
              }}
            >
```

- [ ] **Step 2: 오늘의 할 일에 드롭 영역을 만든다**

`components/today-board/today-list.tsx` 의 import 를 바꾼다.

```tsx
import { useState } from "react";
import { HiOutlineArrowLeft } from "react-icons/hi";
import { Badge } from "@/components/erp/badge";
import {
  ISSUE_DRAG_TYPE,
  UNGROUPED_TITLE,
  type TodayItem,
} from "@/lib/today-board";
```

props 타입에 `onDropIssue` 를 더한다.

```tsx
type TodayListProps = {
  date: string;
  items: TodayItem[];
  projectTitles: Record<string, string>;
  onToggle: (item: TodayItem) => void;
  onReturn: (item: TodayItem) => void;
  onDropIssue: (issueId: string) => void;
};
```

시그니처와 첫 줄을 바꾼다.

```tsx
export function TodayList({
  date,
  items,
  projectTitles,
  onToggle,
  onReturn,
  onDropIssue,
}: TodayListProps) {
  const [dragOver, setDragOver] = useState(false);
  const doneCount = items.filter((item) => item.done).length;
```

목록을 감싼 `<div>` 에 드롭 핸들러와 강조 스타일을 붙인다. `dataTransfer.types` 로 이슈 카드인지 판정해, 파일이나 다른 것을 끌어와도 반응하지 않게 한다.

```tsx
      <div
        className={`rounded-[4px] border transition ${
          dragOver
            ? "border-dashed border-[var(--bi-accent)] bg-[var(--bi-accent-light)]"
            : "border-[var(--bi-border)] bg-[var(--bi-card-bg)]"
        }`}
        onDragLeave={(event) => {
          // 자식 위로 옮겨갈 때도 dragleave 가 뜬다. 영역 밖으로 나간 것만 센다.
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(ISSUE_DRAG_TYPE)) return;
          event.preventDefault();
          setDragOver(false);
          const issueId = event.dataTransfer.getData(ISSUE_DRAG_TYPE);
          if (issueId) onDropIssue(issueId);
        }}
      >
```

- [ ] **Step 3: 보드에 드롭 핸들러를 연결한다**

`components/today-board/today-board.tsx` 에 핸들러를 더한다. 드롭은 id 만 넘어오므로 안내 문구를 만들려면 현재 보드에서 항목을 찾아야 한다. `setBoard` 업데이터 안에서 찾지 않는다 — 업데이터는 순수해야 한다.

```tsx
  const handleDropIssue = (issueId: string) => {
    const issue = board?.issues.find((item) => item.id === issueId);
    if (!issue) return;
    handleSendToToday(issue);
  };
```

`handleDropIssue` 는 `board` 를 읽으므로 `if (!board)` early return **아래**, `return (` 위에 둔다.

`TodayList` 에 넘긴다.

```tsx
        <TodayList
          date={board.date}
          items={board.today}
          onDropIssue={handleDropIssue}
          onReturn={handleReturn}
          onToggle={handleToggle}
          projectTitles={projectTitles}
        />
```

- [ ] **Step 4: 타입 검사와 화면을 확인한다**

Run: `pnpm typecheck`
Expected: 오류 없음

Run: 브라우저에서 `/today`
Expected: 이슈 카드를 오른쪽으로 끌면 드롭 영역이 점선으로 강조되고, 놓으면 오늘의 할 일로 옮겨진다. 영역 밖에 놓으면 아무 일도 없다. 버튼 경로도 그대로 동작한다.

- [ ] **Step 5: 커밋한다**

```bash
git add components/today-board
git commit -m "feat: 이슈를 오늘의 할 일로 끌어다 놓기 추가"
```

---

### Task 4: 사이드바 링크와 문서

**Files:**
- Modify: `components/shell/app-sidebar.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2 의 `/today` 라우트
- Produces: 없음

- [ ] **Step 1: 사이드바에 링크를 넣는다**

`components/shell/app-sidebar.tsx` 의 `전체 프로젝트` 링크 **위**에 넣는다. 최상단에 두어 가장 자주 여는 화면임을 드러낸다. `전체 프로젝트` 는 위에 링크가 생겼으니 `작성 가이드` 와 같은 `-mt-1` 로 간격을 맞춘다.

```tsx
      <Link href="/today" className={`${linkCls(pathname === "/today")} pl-2`}>
        오늘의 할 일
      </Link>
      <Link
        href="/flows"
        className={`-mt-1 ${linkCls(pathname === "/flows")} pl-2`}
      >
        전체 프로젝트
      </Link>
```

- [ ] **Step 2: README 를 갱신한다**

`README.md` 라우트 표의 `/flows` 줄 **위**에 넣는다.

```markdown
| `/today` | 오늘의 할 일 — 프로젝트별 이슈를 끌어다 놓고 체크, 날짜가 바뀌면 자동 정리 |
```

디렉터리 트리의 `components/` 아래 `project-notes/` 줄 다음에 넣는다.

```
  today-board/           오늘의 할 일 보드 (이슈 풀 · 오늘 목록)
```

- [ ] **Step 3: 전체를 확인한다**

Run: `node --test lib/today-board.test.mjs`
Expected: PASS

Run: `pnpm typecheck`
Expected: 오류 없음

Run: 브라우저에서 사이드바의 `오늘의 할 일` 을 누른다
Expected: `/today` 로 이동하고 링크가 활성 상태로 표시된다.

- [ ] **Step 4: 커밋한다**

```bash
git add components/shell/app-sidebar.tsx README.md
git commit -m "feat: 사이드바에 오늘의 할 일 링크 추가"
```

---

## 검증 요약

전체 작업을 마친 뒤:

```bash
node --test lib/today-board.test.mjs
pnpm typecheck
```

브라우저에서 확인할 것:

1. 이슈 추가 → 새로고침 → 남아 있다
2. 드래그로 오늘의 할 일로 이동
3. `→` 버튼으로도 이동 (키보드만으로 완주 가능)
4. 체크 → 취소선과 진행률
5. `←` 되돌리기 → 원래 프로젝트 그룹으로 복귀
6. 삭제 → 확인창
7. 날짜 롤오버 — 개발자 도구에서 저장값의 `date` 를 어제로 바꾸고 새로고침하면, 완료 항목은 사라지고 미완료 항목은 이슈 풀로 돌아온다
