# 플로우차트 구조 보완 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참조 사이트(project-flow-chart.vercel.app)처럼 프로젝트 → 카테고리 → 차트 3단 계층, 트리 사이드바+검색, 브레드크럼·범례 칩·"읽는 법"·SVG 저장을 갖춘 플로우차트 사이트로 보완한다.

**Architecture:** 레지스트리를 `flowProjects`(3단)로 재편하고, `/flows/[slug]` 라우트를 `/flows/[project]?cat=&chart=` 쿼리파람 방식으로 교체한다. 서버 컴포넌트가 `searchParams`를 읽어 폴백 포함 차트를 결정하고, 사이드바는 같은 폴백 규칙(`resolveChart`)으로 활성 상태를 판정한다.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind v4 (`--bi-*` 토큰) · @xyflow/react 12 · @dagrejs/dagre · html-to-image(신규 1개)

**Spec:** `docs/superpowers/specs/2026-08-05-flowchart-site-restructure-design.md`

## Global Constraints

- 패키지 매니저는 pnpm. dev 서버 포트는 30001 (`pnpm dev`).
- 테스트 프레임워크 없음 — 태스크별 검증은 `pnpm typecheck`(필수) + 라우트 영향 태스크는 `pnpm build`. 동작 검증은 마지막 태스크에서 Playwright(MCP)로 일괄 수행.
- 커밋 메시지에 `Co-Authored-By` 트레일러를 **넣지 않는다** (사용자 전역 규칙).
- 좌표를 데이터에 넣지 않는다 (Dagre 위임). 데이터(lib/flows)와 렌더(components/flow) 분리 유지.
- 색은 `--bi-*` CSS 변수 토큰만 사용 (`app/globals.css`). 에러 색은 `--bi-error`.
- 기존 차트의 nodes/edges 는 수정하지 않는다 (`howToRead` 필드 추가만 허용).
- Task 3~4 사이에는 사이드바·목록의 옛 `/flows/<차트slug>` 링크가 일시적으로 404 가 된다. Task 4(사이드바)·Task 5(목록)에서 수렴하므로 중간 태스크에서 고치려 하지 말 것.

---

### Task 1: 타입 확장 + 레지스트리 3단 재편 (임시 호환 export 유지)

**Files:**
- Modify: `components/flow/types.ts:104-128`
- Modify: `lib/flows/registry.ts` (전체 교체)

**Interfaces:**
- Consumes: 기존 차트 5개 export (`deliveryLifecycle`, `changeControl`, `pricelistSummary`, `pricelistOverall`, `pricelistWorker`)
- Produces: `FlowProject` 타입, `FlowCategory.slug: string`, `FlowChart.howToRead?: string[]`, `flowProjects: FlowProject[]`, `getProject(slug: string): FlowProject | undefined`, `resolveChart(project: FlowProject, catSlug?: string, chartSlug?: string): { category: FlowCategory; chart: FlowChart }`, `chartHref(projectSlug: string, catSlug: string, chartSlug: string): string`, `projectChartCount(project: FlowProject): number`. 임시 호환: `flowCategories`, `allCharts`, `getChart` (Task 5 에서 제거).

- [ ] **Step 1: `components/flow/types.ts` 수정**

`FlowChart` 타입의 `caption?: string;` 줄 다음에 필드 추가:

```ts
  /** 차트 아래 "읽는 법" 불릿. 비우면 섹션 자체가 생략된다. */
  howToRead?: string[];
```

파일 끝의 `FlowCategory` 를 다음으로 교체하고, 그 아래 `FlowProject` 를 추가:

```ts
/** 사이드바·목록 페이지에서 플로우차트를 묶는 단위. */
export type FlowCategory = {
  /** `cat` 쿼리파람 값 — 같은 프로젝트 안에서 유일해야 한다. */
  slug: string;
  title: string;
  charts: FlowChart[];
};

/** 트리 최상위 단위 — 고객사(또는 공통) 프로젝트. `/flows/<slug>` 라우트가 된다. */
export type FlowProject = {
  /** URL 경로 세그먼트 — `/flows/<slug>` */
  slug: string;
  title: string;
  /** 프로젝트 헤더 소개문. `**...**` 로 강조를 표시한다 (RichText 가 <strong> 으로 렌더). */
  intro?: string;
  categories: FlowCategory[];
};
```

- [ ] **Step 2: `lib/flows/registry.ts` 전체 교체**

```ts
import type {
  FlowCategory,
  FlowChart,
  FlowProject,
} from "@/components/flow/types";
import { changeControl } from "./change-control";
import { deliveryLifecycle } from "./delivery-lifecycle";
import { pricelistOverall } from "./pricelist-overall";
import { pricelistSummary } from "./pricelist-summary";
import { pricelistWorker } from "./pricelist-worker";

/* -------------------------------------------------------------------------
 * 플로우차트 레지스트리 — 프로젝트 → 카테고리 → 차트 3단.
 *
 * 새 플로우차트 추가 순서:
 *  1. `lib/flows/<slug>.ts` 에 FlowChart 를 선언한다 (기존 파일 복사 권장).
 *  2. 아래 flowProjects 의 알맞은 프로젝트/카테고리 charts 에 넣는다.
 * 사이드바·목록·상세 라우트가 전부 이 배열에서 파생되므로 그 외 등록은 없다.
 *
 * 불변식:
 *  - 프로젝트마다 카테고리 1개 이상, 카테고리마다 차트 1개 이상
 *    (resolveChart 의 [0] 폴백이 이 전제를 깔고 있다)
 *  - 차트 slug 는 같은 프로젝트 안에서만 유일하면 된다 (전역 유일 요구 없음)
 * ---------------------------------------------------------------------- */

export const flowProjects: FlowProject[] = [
  {
    slug: "common",
    title: "공통",
    intro:
      "고객사와 무관하게 반복 적용하는 **프로젝트 수행 표준**입니다. " +
      "착수부터 안정화까지의 딜리버리 라이프사이클과 요구사항 변경 통제 흐름을 담습니다.",
    categories: [
      {
        slug: "delivery",
        title: "프로젝트 수행",
        charts: [deliveryLifecycle, changeControl],
      },
    ],
  },
  {
    slug: "tns",
    title: "티앤에스",
    intro:
      "티앤에스 **가격표 자동 적재** 파이프라인입니다. " +
      "**요약 → 전체 → 워커 상세** 순서로, 앞의 것으로 설명하고 뒤의 것으로 구현합니다.",
    categories: [
      {
        slug: "pricelist",
        title: "가격표 자동 적재",
        charts: [pricelistSummary, pricelistOverall, pricelistWorker],
      },
    ],
  },
];

export function getProject(slug: string): FlowProject | undefined {
  return flowProjects.find((p) => p.slug === slug);
}

/**
 * 쿼리파람(cat/chart) → 실제 카테고리·차트. 못 찾으면 첫 카테고리·첫 차트로
 * 폴백한다 (404 아님 — 스펙의 폴백 규칙). cat 이 틀리면 chart 는 폴백된
 * 카테고리 안에서만 찾는다.
 */
export function resolveChart(
  project: FlowProject,
  catSlug?: string,
  chartSlug?: string
): { category: FlowCategory; chart: FlowChart } {
  const category =
    project.categories.find((c) => c.slug === catSlug) ?? project.categories[0];
  const chart =
    category.charts.find((c) => c.slug === chartSlug) ?? category.charts[0];
  return { category, chart };
}

/** 차트 상세 주소 — `/flows/<project>?cat=<category>&chart=<chart>` */
export function chartHref(
  projectSlug: string,
  catSlug: string,
  chartSlug: string
): string {
  return `/flows/${projectSlug}?cat=${catSlug}&chart=${chartSlug}`;
}

export function projectChartCount(project: FlowProject): number {
  return project.categories.reduce((n, c) => n + c.charts.length, 0);
}

/* ── 임시 호환 export — Task 5(목록 재편)에서 소비처 정리 후 삭제한다 ── */
export const flowCategories: FlowCategory[] = flowProjects.flatMap(
  (p) => p.categories
);
export const allCharts: FlowChart[] = flowCategories.flatMap((c) => c.charts);
export function getChart(slug: string): FlowChart | undefined {
  return allCharts.find((c) => c.slug === slug);
}
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm typecheck`
Expected: PASS (기존 소비처는 호환 export 로 그대로 컴파일)

- [ ] **Step 4: Commit**

```bash
git add components/flow/types.ts lib/flows/registry.ts
git commit -m "feat: 레지스트리를 프로젝트→카테고리→차트 3단으로 재편"
```

---

### Task 2: 차트 5개에 "읽는 법" 불릿 추가

**Files:**
- Modify: `lib/flows/delivery-lifecycle.ts` (FlowChart 객체의 `direction` 줄 다음)
- Modify: `lib/flows/change-control.ts` (동일 위치)
- Modify: `lib/flows/pricelist-summary.ts` (`nodeWidth` 줄 다음)
- Modify: `lib/flows/pricelist-overall.ts` (`nodeWidth` 줄 다음)
- Modify: `lib/flows/pricelist-worker.ts` (`nodeWidth` 줄 다음)

**Interfaces:**
- Consumes: Task 1 의 `FlowChart.howToRead?: string[]`
- Produces: 각 차트 객체의 `howToRead` 배열 (Task 3 페이지가 렌더)

- [ ] **Step 1: 각 차트에 `howToRead` 추가** — nodes/edges 는 절대 수정하지 않는다.

`delivery-lifecycle.ts`:

```ts
  howToRead: [
    "착수 → 요구사항 → 설계 → 개발·검수 → 이행·안정화 순서로 왼쪽에서 오른쪽으로 읽습니다.",
    "시나리오 검수에서 세 갈래로 갈라집니다 — 실패 건은 결함 처리로, 범위 밖 요건은 범위 변경 관리로, 통과하면 데이터 이행으로 넘어갑니다.",
    "초록 점선(주간 스냅샷)은 WBS·개발 진행을 주간 진척 보고로 모으는 시점 흐름입니다.",
    "회색 점선 카드(프로젝트 멤버·표준 정책·레포지토리)는 단계가 아니라 참조하는 기준정보입니다.",
  ],
```

`change-control.ts`:

```ts
  howToRead: [
    "추가 요건은 어디서 왔든 전부 '변경 요청 등록'을 거쳐 베이스라인(SOW) 대조로 갑니다.",
    "범위 내면 추가 비용 없이 백로그로, 범위 밖이면 영향도 분석 → 공수 산정 → 고객 협의로 갑니다.",
    "고객 협의 결과는 셋 중 하나입니다 — 반려·보류(종료), 금액·기간 변경이면 계약 변경을 거쳐 범위 갱신, 그 외에는 바로 범위·WBS 갱신.",
    "어느 경로든 실제 구현은 개발 백로그 반영을 통해서만 시작됩니다.",
  ],
```

`pricelist-summary.ts`:

```ts
  howToRead: [
    "가격표 파일 한 건이 업로드부터 ACTIVE 마스터까지 가는 길만 남긴 설명용 요약입니다. 구현 상세는 «전체 흐름»·«워커 상세» 차트에 있습니다.",
    "분기는 넷뿐입니다 — 아는 구조인가, 검증을 통과했나, 실패를 어디로 되돌리나, 더는 못 고치나.",
    "사람이 개입하는 자리는 둘입니다 — 신규 구조를 추출 전에 확인할 때, 격리된 범위를 활성화 전에 검토할 때.",
    "실패·반려는 버리지 않고 복구 박스에서 원인별로 가장 가까운 단계로 되돌립니다. 원천자료 부족·반려 확정만 보류로 남습니다.",
  ],
```

`pricelist-overall.ts`:

```ts
  howToRead: [
    "대문자 그룹 라벨은 워커의 배치 상태 이름입니다. 배치는 위에서 아래로 상태를 넘어가고, 한 상태 안에서는 왼쪽에서 오른쪽으로 처리됩니다.",
    "브랜드 라우팅에서 KNOWN / CHANGED / UNKNOWN 이 갈라집니다. 신규·변경 구조는 전체 추출 전에 파일럿과 구조 카드 승인을 먼저 받습니다.",
    "Tier 3 사람 수정은 검증 면제가 아닙니다 — staging 갱신 후 재검증을 거쳐 새 AUDIT-PASS 를 받고 게이트를 재판정합니다.",
    "실패·반려는 전부 복구 루프의 원인 분류로 모이고, 원본/구조/판독/조립 중 가장 가까운 단계로만 되돌아갑니다.",
  ],
```

`pricelist-worker.ts`:

```ts
  howToRead: [
    "그룹 라벨이 곧 배치 상태 머신입니다. 방 하나가 상태 하나, 방 안 박스는 그 상태의 실제 처리 순서입니다.",
    "본선에 속하지 않는 실행 통제·저장·통제 경계·모델 정책·평가는 본선 옆 라인으로 빠져 있습니다.",
    "사람 화면은 둘로 분리되어 있습니다 — 온보딩 구조 확인(어댑터 학습)과 격리 항목 검토(staging 수정)는 다른 업무입니다.",
    "RECOVERY 그룹에서 나가는 점선 넷(재렌더·부분 온보딩·재판독·조립 재판정)이 원인별 복귀 지점입니다. 사람 반려도 DLQ 가 아니라 이 복구 루프로 들어갑니다.",
  ],
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/flows/
git commit -m "feat: 차트 5개에 읽는 법(howToRead) 불릿 추가"
```

---

### Task 3: RichText 컴포넌트 + `/flows/[project]` 라우트 (기존 `[slug]` 제거)

**Files:**
- Create: `components/rich-text.tsx`
- Create: `app/flows/[project]/page.tsx`
- Delete: `app/flows/[slug]/page.tsx` (디렉터리째)

**Interfaces:**
- Consumes: Task 1 의 `flowProjects`, `getProject`, `resolveChart`; Task 2 의 `howToRead`; 기존 `FlowLegend`, `ProcessFlow`
- Produces: `RichText({ text }: { text: string })` — `**...**` 를 `<strong>` 으로 렌더. Task 5 목록 페이지도 사용.

- [ ] **Step 1: `components/rich-text.tsx` 생성**

```tsx
/* -------------------------------------------------------------------------
 * `**강조**` 마크업만 지원하는 초소형 리치텍스트.
 * 데이터 파일(.ts)에 JSX 를 넣지 않기 위한 장치다 — 다른 문법은 지원하지 않는다.
 * ---------------------------------------------------------------------- */

export function RichText({ text }: { text: string }) {
  // "a **b** c".split(/\*\*(.+?)\*\*/g) → ["a ", "b", " c"] — 홀수 인덱스가 강조.
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-[var(--bi-fg)]">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
```

- [ ] **Step 2: `app/flows/[project]/page.tsx` 생성**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlowLegend } from "@/components/flow/flow-legend";
import { ProcessFlow } from "@/components/flow/process-flow";
import { RichText } from "@/components/rich-text";
import { flowProjects, getProject, resolveChart } from "@/lib/flows/registry";

type PageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ cat?: string; chart?: string }>;
};

export function generateStaticParams() {
  return flowProjects.map((p) => ({ project: p.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { project: projectSlug } = await params;
  const project = getProject(projectSlug);
  if (!project) return {};
  const sp = await searchParams;
  const { chart } = resolveChart(project, sp.cat, sp.chart);
  return {
    title: `${chart.title} — ${project.title} — 프로젝트 매니지먼트`,
    description: chart.description,
  };
}

export default async function ProjectFlowsPage({
  params,
  searchParams,
}: PageProps) {
  const { project: projectSlug } = await params;
  const project = getProject(projectSlug);
  if (!project) notFound();
  const sp = await searchParams;
  // 잘못된 cat/chart 는 첫 카테고리·첫 차트로 폴백한다 (404 아님).
  const { category, chart } = resolveChart(project, sp.cat, sp.chart);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <header className="mb-4 border-b border-[var(--bi-border)] pb-4">
        <h1 className="mt-0 mb-1 text-[20px] font-bold tracking-[-0.01em] text-[var(--bi-fg)]">
          {project.title}
        </h1>
        {project.intro ? (
          <p className="m-0 max-w-[720px] text-[13px] leading-[1.7] text-[var(--bi-fg)]">
            <RichText text={project.intro} />
          </p>
        ) : null}
      </header>

      <nav
        aria-label="위치"
        className="mb-2 flex items-center gap-1.5 text-[11px] text-[var(--bi-muted)]"
      >
        <span>{project.title}</span>
        <span aria-hidden>›</span>
        <span>{category.title}</span>
        <span aria-hidden>›</span>
        <span className="font-semibold text-[var(--bi-fg)]">{chart.title}</span>
      </nav>

      <h2 className="mt-0 mb-1 text-[17px] font-bold tracking-[-0.01em] text-[var(--bi-fg)]">
        {chart.title}
      </h2>
      {chart.description ? (
        <p className="m-0 mb-3 text-[12px] leading-[1.6] text-[var(--bi-muted)]">
          {chart.description}
        </p>
      ) : null}

      <div className="mb-3">
        <FlowLegend chart={chart} />
      </div>

      <ProcessFlow chart={chart} height={560} />

      {chart.howToRead?.length ? (
        <section className="mt-5">
          <h3 className="mt-0 mb-2 text-[14px] font-semibold text-[var(--bi-fg)]">
            읽는 법
          </h3>
          <ul className="m-0 list-disc space-y-1.5 pl-5 text-[13px] leading-[1.7] text-[var(--bi-fg)]">
            {chart.howToRead.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: 기존 라우트 삭제**

```bash
rm -rf "app/flows/[slug]"
```

- [ ] **Step 4: 타입 검사 + 빌드**

Run: `pnpm typecheck && pnpm build`
Expected: 둘 다 PASS. 빌드 출력에 `/flows/[project]` 가 동적(ƒ) 라우트로 표시됨 (searchParams 사용 때문 — 정상).

- [ ] **Step 5: Commit**

```bash
git add components/rich-text.tsx "app/flows/[project]" "app/flows/[slug]"
git commit -m "feat: /flows/[project]?cat=&chart= 라우트로 교체 (브레드크럼·읽는 법·프로젝트 헤더)"
```

---

### Task 4: 사이드바 3단 트리 + 검색

**Files:**
- Modify: `components/shell/app-sidebar.tsx` (전체 교체)
- Modify: `components/shell/app-shell.tsx` (Suspense 래핑)

**Interfaces:**
- Consumes: Task 1 의 `flowProjects`, `resolveChart`, `chartHref`, `projectChartCount`; `FlowChart` 타입
- Produces: 없음 (말단 UI)

- [ ] **Step 1: `components/shell/app-sidebar.tsx` 전체 교체**

```tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HiChevronRight, HiOutlineSearch } from "react-icons/hi";
import type { FlowChart } from "@/components/flow/types";
import {
  chartHref,
  flowProjects,
  projectChartCount,
  resolveChart,
} from "@/lib/flows/registry";

/* -------------------------------------------------------------------------
 * 3단 트리 사이드바 — 프로젝트 → 카테고리 → 차트.
 *
 * 접힘 상태: 사용자가 토글한 적 있으면 localStorage 값, 없으면 활성 차트의
 * 조상만 펼친다. 검색 중에는 접힘을 무시하고 매칭된 차트만 전부 펼쳐 보인다.
 * ---------------------------------------------------------------------- */

const STORAGE_KEY = "flows-sidebar-collapsed-v2";

const projectKey = (p: string) => `p:${p}`;
const categoryKey = (p: string, c: string) => `c:${p}/${c}`;

function chartMatches(chart: FlowChart, q: string): boolean {
  return `${chart.title} ${chart.description ?? ""}`.toLowerCase().includes(q);
}

const linkCls = (active: boolean) =>
  `mx-2 flex h-8 items-center gap-2 rounded-[3px] px-2 text-[12px] transition ${
    active
      ? "bg-[var(--bi-sidebar-active)] font-semibold text-[var(--bi-fg)]"
      : "text-[var(--bi-fg)] hover:bg-[var(--bi-sidebar-active)]"
  }`;

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setUserOverrides(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (key: string, currentlyCollapsed: boolean) => {
    setUserOverrides((prev) => {
      const next = { ...prev, [key]: !currentlyCollapsed };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* quota 에러 무시 */
      }
      return next;
    });
  };

  // 현재 보고 있는 위치 — 서버 페이지와 같은 폴백 규칙(resolveChart)으로 판정.
  const active = useMemo(() => {
    const m = pathname.match(/^\/flows\/([^/]+)$/);
    if (!m) return null;
    const project = flowProjects.find((p) => p.slug === m[1]);
    if (!project) return null;
    const { category, chart } = resolveChart(
      project,
      searchParams.get("cat") ?? undefined,
      searchParams.get("chart") ?? undefined
    );
    return {
      project: project.slug,
      category: category.slug,
      chart: chart.slug,
    };
  }, [pathname, searchParams]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // 검색 중이면 매칭 차트만 남긴 프로젝트 목록, 아니면 원본.
  const visibleProjects = useMemo(() => {
    if (!searching) {
      return flowProjects.map((p) => ({ project: p, categories: p.categories }));
    }
    return flowProjects
      .map((p) => ({
        project: p,
        categories: p.categories
          .map((c) => ({ ...c, charts: c.charts.filter((ch) => chartMatches(ch, q)) }))
          .filter((c) => c.charts.length > 0),
      }))
      .filter((p) => p.categories.length > 0);
  }, [searching, q]);

  return (
    <nav className="flex h-full flex-col gap-2 overflow-y-auto py-3">
      <Link href="/flows" className={linkCls(pathname === "/flows")}>
        전체 플로우차트
      </Link>
      <Link href="/guide" className={`-mt-1 ${linkCls(pathname === "/guide")}`}>
        작성 가이드
      </Link>

      <div className="mx-2 flex items-center gap-1.5 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2">
        <HiOutlineSearch size={12} className="shrink-0 text-[var(--bi-muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="차트 검색"
          aria-label="차트 검색"
          className="h-7 w-full bg-transparent text-[12px] text-[var(--bi-fg)] outline-none placeholder:text-[var(--bi-muted)]"
        />
      </div>

      {searching && visibleProjects.length === 0 ? (
        <p className="mx-4 my-1 text-[11px] text-[var(--bi-muted)]">
          일치하는 차트 없음
        </p>
      ) : null}

      {visibleProjects.map(({ project, categories }) => {
        const pKey = projectKey(project.slug);
        const projectActive = active?.project === project.slug;
        const pCollapsed = searching
          ? false
          : pKey in userOverrides
            ? userOverrides[pKey]
            : !projectActive;

        return (
          <div key={project.slug}>
            <button
              type="button"
              aria-expanded={!pCollapsed}
              onClick={() => toggle(pKey, pCollapsed)}
              className="flex w-full items-center gap-1.5 px-4 pt-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[var(--bi-muted)] uppercase transition hover:text-[var(--bi-fg)]"
            >
              <HiChevronRight
                size={10}
                className={`shrink-0 transition-transform ${
                  pCollapsed ? "rotate-0" : "rotate-90"
                }`}
              />
              <span className="truncate">{project.title}</span>
              <span className="ml-auto font-normal tracking-normal">
                {projectChartCount(project)}
              </span>
            </button>

            {!pCollapsed
              ? categories.map((category) => {
                  const cKey = categoryKey(project.slug, category.slug);
                  const categoryActive =
                    projectActive && active?.category === category.slug;
                  const cCollapsed = searching
                    ? false
                    : cKey in userOverrides
                      ? userOverrides[cKey]
                      : !categoryActive;

                  return (
                    <div key={category.slug}>
                      <button
                        type="button"
                        aria-expanded={!cCollapsed}
                        onClick={() => toggle(cKey, cCollapsed)}
                        className="flex w-full items-center gap-1.5 py-1 pr-4 pl-7 text-[11px] font-medium text-[var(--bi-muted)] transition hover:text-[var(--bi-fg)]"
                      >
                        <HiChevronRight
                          size={10}
                          className={`shrink-0 transition-transform ${
                            cCollapsed ? "rotate-0" : "rotate-90"
                          }`}
                        />
                        <span className="truncate">{category.title}</span>
                        <span className="ml-auto">{category.charts.length}</span>
                      </button>

                      {!cCollapsed
                        ? category.charts.map((chart) => {
                            const isActive =
                              categoryActive && active?.chart === chart.slug;
                            return (
                              <Link
                                key={chart.slug}
                                href={chartHref(
                                  project.slug,
                                  category.slug,
                                  chart.slug
                                )}
                                aria-current={isActive ? "page" : undefined}
                                className={`${linkCls(isActive)} ml-6`}
                              >
                                <span className="truncate">{chart.title}</span>
                              </Link>
                            );
                          })
                        : null}
                    </div>
                  );
                })
              : null}
          </div>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: `components/shell/app-shell.tsx` — Suspense 래핑**

`useSearchParams` 를 쓰는 클라이언트 컴포넌트는 정적 렌더 페이지(/flows, /guide)에서 `<Suspense>` 경계가 필요하다 (없으면 빌드 에러).

import 에 `Suspense` 추가:

```tsx
import { Suspense, type ReactNode } from "react";
```

`<AppSidebar />` 를 다음으로 교체:

```tsx
<Suspense fallback={null}>
  <AppSidebar />
</Suspense>
```

- [ ] **Step 3: 타입 검사 + 빌드**

Run: `pnpm typecheck && pnpm build`
Expected: 둘 다 PASS (`useSearchParams ... suspense boundary` 에러가 없어야 함)

- [ ] **Step 4: Commit**

```bash
git add components/shell/
git commit -m "feat: 사이드바를 3단 트리(개수 배지·접이식)로 재편하고 차트 검색 추가"
```

---

### Task 5: `/flows` 목록 재편 + 호환 export 제거 + 문서 갱신

**Files:**
- Modify: `app/flows/page.tsx` (섹션 구조 교체)
- Modify: `lib/flows/registry.ts` (파일 끝 호환 export 블록 삭제)
- Modify: `README.md:28-66` (라우트 표·디렉터리·추가 절차)
- Modify: `app/guide/page.mdx:59-72` (레지스트리 등록 Step)

**Interfaces:**
- Consumes: Task 1 의 `flowProjects`, `chartHref`; Task 3 의 `RichText`
- Produces: 없음. `flowCategories`/`allCharts`/`getChart` 는 이 태스크 이후 존재하지 않는다.

- [ ] **Step 1: `app/flows/page.tsx` 의 본문 교체**

import 를 다음으로 교체:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { RichText } from "@/components/rich-text";
import { chartHref, flowProjects } from "@/lib/flows/registry";
```

`{flowCategories.map(...)}` 전체 블록을 다음으로 교체 (상단 h1·설명 문단은 유지):

```tsx
      {flowProjects.map((project) => (
        <section key={project.slug} className="mt-8">
          <h2 className="mt-0 mb-1 border-t border-[var(--bi-border)] pt-6 text-[16px] font-semibold tracking-[-0.005em] text-[var(--bi-fg)]">
            {project.title}
          </h2>
          {project.intro ? (
            <p className="m-0 mb-3 text-[12px] leading-[1.7] text-[var(--bi-muted)]">
              <RichText text={project.intro} />
            </p>
          ) : null}

          {project.categories.map((category) => (
            <div key={category.slug} className="mt-3">
              <h3 className="mt-0 mb-2 text-[13px] font-semibold text-[var(--bi-fg)]">
                {category.title}
                <span className="ml-1.5 font-normal text-[var(--bi-muted)]">
                  {category.charts.length}
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {category.charts.map((chart) => (
                  <Link
                    key={chart.slug}
                    href={chartHref(project.slug, category.slug, chart.slug)}
                    className="group flex flex-col gap-1 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3.5 py-3 transition hover:border-[var(--bi-accent)]"
                  >
                    <span className="text-[13px] font-semibold text-[var(--bi-fg)]">
                      {chart.title}
                    </span>
                    {chart.description ? (
                      <span className="text-[12px] leading-[1.6] text-[var(--bi-muted)]">
                        {chart.description}
                      </span>
                    ) : null}
                    <span className="mt-1 text-[11px] text-[var(--bi-muted)]">
                      노드 {chart.nodes.length} · 연결 {chart.edges.length}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
```

- [ ] **Step 2: `lib/flows/registry.ts` 에서 "임시 호환 export" 블록(주석 포함) 삭제**

- [ ] **Step 3: README 갱신** — 라우트 표를 다음으로 교체:

```markdown
| 경로 | 내용 |
| --- | --- |
| `/flows` | 전체 목록 — 프로젝트 → 카테고리 → 차트 |
| `/flows/[project]?cat=&chart=` | 프로젝트 화면 — 쿼리파람으로 차트 전환, 잘못된 값은 첫 차트 폴백 |
| `/guide` | 플로우차트 작성 가이드 (MDX) |
```

디렉터리 절의 `registry.ts` 줄을 `registry.ts            프로젝트 → 카테고리 → 차트 트리의 단일 소스` 로, "새 플로우차트 추가" 절의 2번을 `2. lib/flows/registry.ts 의 flowProjects 알맞은 프로젝트/카테고리에 등록` 으로 수정. `components/` 절에 `rich-text.tsx  **강조** 만 지원하는 초소형 리치텍스트` 줄 추가.

- [ ] **Step 4: `app/guide/page.mdx` 의 "레지스트리에 등록" Step 을 다음으로 교체**

```mdx
  <Step title="레지스트리에 등록">
    `lib/flows/registry.ts` 의 `flowProjects` 에서 알맞은 프로젝트/카테고리의
    `charts` 에 넣습니다. 사이드바 트리, 목록 페이지, `/flows/<project>` 라우트가
    전부 여기서 파생되므로 **다른 등록 절차는 없습니다.**

    ```ts
    export const flowProjects: FlowProject[] = [
      {
        slug: "common",
        title: "공통",
        categories: [
          { slug: "delivery", title: "프로젝트 수행", charts: [deliveryLifecycle, changeControl, myFlow] },
        ],
      },
    ];
    ```
  </Step>
```

같은 파일의 "확인" Step 문구도 `/flows/<slug>` → `` `/flows/<project>?cat=<카테고리>&chart=<slug>` `` 로 수정. 41-42번째 줄 예시 주석 `// URL: /flows/my-flow` 는 `// chart 쿼리파람 값` 으로 수정.

- [ ] **Step 5: 타입 검사 + 빌드**

Run: `pnpm typecheck && pnpm build`
Expected: 둘 다 PASS (호환 export 참조가 남아 있으면 여기서 잡힌다)

- [ ] **Step 6: Commit**

```bash
git add app/flows/page.tsx lib/flows/registry.ts README.md app/guide/page.mdx
git commit -m "feat: 목록 페이지를 프로젝트 계층으로 재편하고 호환 export 제거"
```

---

### Task 6: 범례를 인라인 칩으로 재스타일

**Files:**
- Modify: `components/flow/flow-legend.tsx:47-116` (`FlowLegend` 함수 본문만 — `EDGE_LEGEND`·`Swatch` 는 유지)

**Interfaces:**
- Consumes: 기존 `KIND_STYLE`, `EDGE_LEGEND`
- Produces: `FlowLegend({ chart })` — 시그니처 불변, 렌더만 칩 나열로 변경

- [ ] **Step 1: `Swatch` 의 크기 클래스를 `h-4 w-7` → `h-3 w-5` 로 축소**

- [ ] **Step 2: `FlowLegend` 반환 JSX 를 다음으로 교체** (계산 로직 4줄은 유지)

```tsx
  return (
    <div aria-label="범례" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {kinds.map((k) => (
        <span
          key={k}
          title={KIND_STYLE[k].desc}
          className="flex items-center gap-1.5 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-0.5"
        >
          <Swatch kind={k} />
          <span className="text-[11px] text-[var(--bi-fg)]">
            {KIND_STYLE[k].title}
          </span>
        </span>
      ))}
      {edgeKinds.map((k) => (
        <span key={k} className="flex items-center gap-1.5 px-1">
          <span className={`w-6 shrink-0 ${EDGE_LEGEND[k].cls}`} />
          <span className="text-[11px] text-[var(--bi-muted)]">
            {EDGE_LEGEND[k].label}
          </span>
        </span>
      ))}
      {hasTiming ? (
        <span className="flex items-center gap-1.5 px-1">
          <span className="rounded-[2px] bg-[var(--bi-success)] px-1.5 py-px text-[9px] font-bold text-white">
            ⏱ 시점
          </span>
          <span className="text-[11px] text-[var(--bi-muted)]">도는 주기·마감</span>
        </span>
      ) : null}
      {hasDoc ? (
        <span className="flex items-center gap-1.5 px-1">
          <span className="rounded-[2px] bg-[var(--bi-doc)] px-1.5 py-px text-[9px] font-bold text-white">
            📄 산출물
          </span>
          <span className="text-[11px] text-[var(--bi-muted)]">만들어지는 문서</span>
        </span>
      ) : null}
    </div>
  );
```

- [ ] **Step 3: 타입 검사**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/flow/flow-legend.tsx
git commit -m "feat: 범례를 항상 보이는 인라인 칩으로 재스타일"
```

---

### Task 7: SVG 저장 버튼

**Files:**
- Modify: `package.json` (html-to-image 추가 — `pnpm add` 가 처리)
- Create: `components/flow/export-svg-button.tsx`
- Modify: `components/flow/process-flow.tsx` (Provider 래핑 + 버튼 배치)

**Interfaces:**
- Consumes: `@xyflow/react` 의 `useReactFlow`, `getNodesBounds`, `ReactFlowProvider`; `html-to-image` 의 `toSvg`
- Produces: `ExportSvgButton({ slug, wrapper }: { slug: string; wrapper: React.RefObject<HTMLDivElement | null> })`

- [ ] **Step 1: 의존성 추가**

Run: `pnpm add html-to-image`

- [ ] **Step 2: `components/flow/export-svg-button.tsx` 생성**

```tsx
"use client";

import { useState } from "react";
import { getNodesBounds, useReactFlow } from "@xyflow/react";
import { toSvg } from "html-to-image";
import { HiOutlineDownload } from "react-icons/hi";

/* -------------------------------------------------------------------------
 * 차트 전체를 SVG 파일로 저장.
 *
 * 노드가 HTML 카드라 순수 SVG 직렬화는 불가능하다 — React Flow 공식 권장대로
 * html-to-image 로 `.react-flow__viewport` 를 찍는다. 현재 줌과 무관하게 노드
 * 바운즈 기준 scale(1) 로 캡처하므로 결과물은 항상 전체 차트다.
 * ---------------------------------------------------------------------- */

const PAD = 40;

export function ExportSvgButton({
  slug,
  wrapper,
}: {
  slug: string;
  /** `.react-flow__viewport` 를 포함하는 캔버스 래퍼 (모달 쪽 캔버스와 구분용) */
  wrapper: React.RefObject<HTMLDivElement | null>;
}) {
  const { getNodes } = useReactFlow();
  const [failed, setFailed] = useState(false);

  const onExport = async () => {
    try {
      setFailed(false);
      const viewport = wrapper.current?.querySelector<HTMLElement>(
        ".react-flow__viewport"
      );
      if (!viewport) throw new Error("viewport not found");
      const bounds = getNodesBounds(getNodes());
      const width = Math.ceil(bounds.width) + PAD * 2;
      const height = Math.ceil(bounds.height) + PAD * 2;
      const bg =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bi-bg")
          .trim() || "#ffffff";
      const dataUrl = await toSvg(viewport, {
        width,
        height,
        backgroundColor: bg,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${PAD - bounds.x}px, ${PAD - bounds.y}px) scale(1)`,
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${slug}.svg`;
      a.click();
    } catch {
      setFailed(true);
    }
  };

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {failed ? (
        <span className="text-[10px] text-[var(--bi-error)]">저장 실패</span>
      ) : null}
      <button
        type="button"
        onClick={onExport}
        className="flex items-center gap-1 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-0.5 text-[11px] text-[var(--bi-fg)] transition hover:border-[var(--bi-accent)] hover:text-[var(--bi-accent)]"
        aria-label="SVG 로 저장"
      >
        <HiOutlineDownload size={11} />
        SVG 저장
      </button>
    </span>
  );
}
```

- [ ] **Step 3: `components/flow/process-flow.tsx` 수정**

import 수정 — `useRef` 추가, `ReactFlowProvider` 추가, 버튼 import:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { ExportSvgButton } from "./export-svg-button";
```

`ProcessFlow` 함수 본문 시작에 ref 추가:

```tsx
  const wrapperRef = useRef<HTMLDivElement>(null);
```

인라인 `<figure>` 의 자식 전체를 `<ReactFlowProvider>` 로 감싼다 (모달 쪽은 그대로 — ReactFlow 가 자체 프로바이더를 만든다). 상단 바의 전체화면 버튼을 다음 구조로 교체하고, 캔버스 div 에 `ref` 를 단다:

```tsx
      <figure
        className={`overflow-hidden rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] ${
          fill ? "flex min-h-0 flex-1 flex-col" : "my-4"
        }`}
      >
        <ReactFlowProvider>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] px-3 py-1.5 text-[11px] text-[var(--bi-muted)]">
            <span className="truncate">
              {chart.caption ?? chart.title} · {HINT}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <ExportSvgButton slug={chart.slug} wrapper={wrapperRef} />
              <button
                type="button"
                onClick={openModal}
                className="flex shrink-0 items-center gap-1 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-0.5 text-[11px] text-[var(--bi-fg)] transition hover:border-[var(--bi-accent)] hover:text-[var(--bi-accent)]"
                aria-label="전체화면으로 보기"
              >
                <HiOutlineArrowsExpand size={11} />
                전체화면
              </button>
            </span>
          </div>
          <div
            ref={wrapperRef}
            className={fill ? "min-h-0 flex-1" : undefined}
            style={fill ? undefined : { height }}
          >
            <FlowCanvas chart={chart} />
          </div>
        </ReactFlowProvider>
      </figure>
```

- [ ] **Step 4: 타입 검사 + 빌드**

Run: `pnpm typecheck && pnpm build`
Expected: 둘 다 PASS

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml components/flow/
git commit -m "feat: 차트 SVG 저장 버튼 추가 (html-to-image)"
```

---

### Task 8: 동작 검증 (Playwright) + 마무리

**Files:** 없음 (검증만. 발견된 결함은 이 태스크 안에서 수정 후 커밋)

- [ ] **Step 1: 프로덕션 빌드 확인** — `pnpm build` PASS 재확인

- [ ] **Step 2: dev 서버 기동** — `pnpm dev` (백그라운드, http://localhost:30001)

- [ ] **Step 3: Playwright(MCP) 로 다음을 순서대로 확인**

1. `http://localhost:30001/` → `/flows` 리다이렉트, 프로젝트(공통·티앤에스) → 카테고리 섹션과 카드가 보인다.
2. 사이드바: 프로젝트 2개에 개수 배지(2, 3). 프로젝트/카테고리 접기·펼치기 동작.
3. "티앤에스 → 가격표 자동 적재 → 가격표 자동 적재 — 요약 흐름" 클릭 → URL 이 `/flows/tns?cat=pricelist&chart=pricelist-summary`, 브레드크럼 "티앤에스 › 가격표 자동 적재 › …", 프로젝트 헤더에 "가격표 자동 적재" 강조(굵게), 범례 칩이 항상 보임, 캔버스 아래 "읽는 법" 4개 불릿.
4. 사이드바에서 활성 차트가 강조되고 조상이 펼쳐져 있다.
5. 검색창에 "요약" 입력 → 요약 차트만 남고 자동 펼침. "zzzz" 입력 → "일치하는 차트 없음". 비우면 원상복귀.
6. 폴백: `/flows/tns?cat=nope&chart=nope` 직접 이동 → 첫 차트(요약 흐름) 렌더, 404 아님. `/flows/nope` → 404.
7. "SVG 저장" 클릭 → "저장 실패" 문구가 나타나지 않는다.
8. 전체화면 버튼·Esc 닫기가 여전히 동작한다.

- [ ] **Step 4: 정리 (CLAUDE.md 규칙)** — Playwright 브라우저 닫기(`browser_close`), dev 서버 종료, `.playwright-mcp/` 등 검증 산출물·스크린샷·스냅샷 파일 삭제, 다운로드된 `*.svg` 삭제

- [ ] **Step 5: 결함 수정분이 있으면 커밋** — 메시지: `fix: 동작 검증에서 발견된 결함 수정 (<내용>)`
