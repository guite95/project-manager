# 포커스에이아이 NotebookLM 외부 링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드바의 `포커스에이아이 > NotebookLM` 메뉴 전체를 누르면 지정된 NotebookLM 노트북을 새 탭에서 바로 연다.

**Architecture:** 플로우차트 레지스트리와 분리된 작은 외부 프로젝트 링크 모듈이 링크 데이터와 검색 필터를 소유한다. `AppSidebar`는 기존 플로우 프로젝트와 이 외부 프로젝트를 함께 검색하고, 동일한 행 스타일과 접힘 상태를 재사용해 외부 링크 그룹을 렌더한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind CSS v4, react-icons Heroicons, Node.js 내장 테스트 러너

## Global Constraints

- 프로젝트 이름은 `포커스에이아이`, 메뉴 이름은 `NotebookLM`이다.
- 대상 URL은 `https://notebook.google.com/notebook/a17b9008-778c-407a-8ca0-08bd2e8a0f2e?authuser=2` 한 곳에서만 선언한다.
- 링크는 내부 페이지를 거치지 않고 새 탭에서 직접 연다.
- 링크에 `target="_blank"`와 `rel="noopener noreferrer"`를 사용한다.
- 메뉴 행 오른쪽 끝에 우상향 외부 링크 아이콘을 표시한다.
- 기존 `flowProjects` 데이터, 플로우 라우팅, 목록 페이지는 변경하지 않는다.
- `components/shell/app-sidebar.tsx`의 작업 시작 전 미커밋 스타일 변경을 보존하고 되돌리지 않는다.

---

### Task 1: 외부 프로젝트 링크 데이터와 검색

**Files:**
- Create: `lib/navigation/external-projects.ts`
- Create: `lib/navigation/external-projects.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `ExternalProjectLink`, `ExternalProject`, `externalProjects`, `filterExternalProjects(projects, query)`

- [ ] **Step 1: 링크 데이터와 검색 동작을 고정하는 실패 테스트 작성**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  externalProjects,
  filterExternalProjects,
} from "./external-projects.ts";

test("포커스에이아이 NotebookLM 링크를 정확히 제공한다", () => {
  assert.deepEqual(externalProjects, [
    {
      slug: "focus-ai",
      title: "포커스에이아이",
      links: [
        {
          title: "NotebookLM",
          href: "https://notebook.google.com/notebook/a17b9008-778c-407a-8ca0-08bd2e8a0f2e?authuser=2",
        },
      ],
    },
  ]);
});

test("프로젝트 이름으로 검색하면 프로젝트의 링크를 모두 유지한다", () => {
  assert.deepEqual(filterExternalProjects(externalProjects, "포커스에이아이"), externalProjects);
});

test("링크 이름 검색은 대소문자를 구분하지 않는다", () => {
  assert.deepEqual(filterExternalProjects(externalProjects, "notebooklm"), externalProjects);
});

test("일치하지 않는 검색어는 빈 목록을 반환한다", () => {
  assert.deepEqual(filterExternalProjects(externalProjects, "없는 메뉴"), []);
});
```

- [ ] **Step 2: 테스트를 실행해 모듈 부재로 실패하는지 확인**

Run: `node --experimental-strip-types --test lib/navigation/external-projects.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `external-projects.ts`.

- [ ] **Step 3: 최소 데이터 모델과 필터 구현**

```ts
export type ExternalProjectLink = {
  title: string;
  href: string;
};

export type ExternalProject = {
  slug: string;
  title: string;
  links: ExternalProjectLink[];
};

export const externalProjects: ExternalProject[] = [
  {
    slug: "focus-ai",
    title: "포커스에이아이",
    links: [
      {
        title: "NotebookLM",
        href: "https://notebook.google.com/notebook/a17b9008-778c-407a-8ca0-08bd2e8a0f2e?authuser=2",
      },
    ],
  },
];

export function filterExternalProjects(
  projects: ExternalProject[],
  query: string
): ExternalProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;

  return projects.flatMap((project) => {
    if (project.title.toLowerCase().includes(q)) return [project];
    const links = project.links.filter((link) =>
      link.title.toLowerCase().includes(q)
    );
    return links.length ? [{ ...project, links }] : [];
  });
}
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `node --experimental-strip-types --test lib/navigation/external-projects.test.mjs`

Expected: 4 tests PASS.

- [ ] **Step 5: Task 1 변경 검토**

Run: `git diff --check && git diff -- lib/navigation/external-projects.ts lib/navigation/external-projects.test.mjs`

Expected: 공백 오류가 없고 URL 선언이 한 곳에만 있다.

---

### Task 2: 사이드바 외부 링크 메뉴 렌더링

**Files:**
- Modify: `components/shell/app-sidebar.tsx:6-8,124-176,264`

**Interfaces:**
- Consumes: Task 1의 `externalProjects`, `filterExternalProjects(projects, query)`
- Produces: `포커스에이아이` 외부 프로젝트 그룹과 새 탭 `NotebookLM` 링크 메뉴

- [ ] **Step 1: 외부 링크 아이콘과 데이터 모듈 가져오기**

```tsx
import {
  HiChevronRight,
  HiOutlineExternalLink,
  HiOutlineSearch,
} from "react-icons/hi";
import {
  externalProjects,
  filterExternalProjects,
} from "@/lib/navigation/external-projects";
```

- [ ] **Step 2: 플로우 검색과 같은 검색어로 외부 프로젝트 필터링**

```tsx
const visibleExternalProjects = useMemo(
  () => filterExternalProjects(externalProjects, q),
  [q]
);
```

검색 결과 없음 조건은 다음처럼 두 목록을 모두 확인한다.

```tsx
{searching &&
visibleProjects.length === 0 &&
visibleExternalProjects.length === 0 ? (
  <p className="mx-4 my-1 text-[11px] text-[var(--bi-muted)]">
    일치하는 메뉴 없음
  </p>
) : null}
```

검색 입력의 `placeholder`와 `aria-label`도 `메뉴 검색`으로 바꾼다.

- [ ] **Step 3: 외부 프로젝트 그룹과 링크 행 렌더링**

```tsx
{visibleExternalProjects.map((project) => {
  const pKey = projectKey(project.slug);
  const pCollapsed = searching
    ? false
    : pKey in userOverrides
      ? userOverrides[pKey]
      : false;

  return (
    <div key={project.slug}>
      <button
        type="button"
        aria-expanded={!pCollapsed}
        onClick={() => toggle(pKey, pCollapsed)}
        className={`${ROW_BTN} pl-2 font-semibold text-[var(--bi-fg)] hover:bg-[var(--bi-sidebar-active)]`}
      >
        <HiChevronRight
          size={10}
          className={`shrink-0 transition-transform ${
            pCollapsed ? "rotate-0" : "rotate-90"
          }`}
        />
        <span className="truncate">{project.title}</span>
        <span className="ml-auto font-normal text-[var(--bi-muted)]">
          {project.links.length}
        </span>
      </button>

      {!pCollapsed
        ? project.links.map((externalLink) => (
            <a
              key={externalLink.href}
              href={externalLink.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkCls(false)} pl-12`}
            >
              <span className="truncate">{externalLink.title}</span>
              <HiOutlineExternalLink
                size={13}
                aria-hidden
                className="ml-auto shrink-0 text-[var(--bi-muted)]"
              />
              <span className="sr-only">(새 탭에서 열림)</span>
            </a>
          ))
        : null}
    </div>
  );
})}
```

외부 프로젝트 목록은 검색 결과 안내 다음, 일반 플로우 프로젝트 목록 전에 둔다.
기본 상태는 펼침이며, 검색 중에도 자동으로 펼쳐진다.

- [ ] **Step 4: 단위 테스트와 정적 검증**

Run: `node --experimental-strip-types --test lib/navigation/external-projects.test.mjs`

Expected: 4 tests PASS.

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm build`

Expected: exit 0.

- [ ] **Step 5: 실제 사이드바 동작 확인**

Run: `pnpm dev`

브라우저에서 `http://localhost:30001/flows`를 열고 다음을 확인한다.

1. `포커스에이아이`가 기본으로 펼쳐지고 그 아래 `NotebookLM`이 보인다.
2. `NotebookLM` 오른쪽 끝에 우상향 외부 링크 아이콘이 보인다.
3. 텍스트, 빈 공간, 아이콘 어느 곳을 눌러도 정확한 URL이 새 탭에서 열린다.
4. 검색어 `포커스에이아이`와 `NotebookLM` 모두 외부 메뉴를 남긴다.
5. 검색어 `없는 메뉴`는 `일치하는 메뉴 없음`을 표시한다.
6. 기존 플로우 프로젝트의 접기, 펼치기, 검색이 그대로 동작한다.

검증 후 이 작업에서 시작한 개발 서버와 브라우저를 닫고, 검증용 이미지나 스냅샷을 삭제한다.

- [ ] **Step 6: 사용자 소유 변경 보존 확인**

Run: `git diff --check && git status --short && git diff -- components/shell/app-sidebar.tsx lib/navigation/external-projects.ts lib/navigation/external-projects.test.mjs`

Expected: `app-sidebar.tsx`의 작업 전 행 스타일 변경이 남아 있고, 새 외부 링크 변경만 추가되어 있다. 사용자가 구현 커밋을 요청하지 않았으므로 작업 트리 변경은 커밋하지 않는다.

