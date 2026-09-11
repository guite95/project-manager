"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  HiChevronRight,
  HiOutlineExternalLink,
  HiOutlineSearch,
} from "react-icons/hi";
import type { FlowChart } from "@/components/flow/types";
import { chartHref, flowProjects, resolveChart } from "@/lib/flows/registry";
import {
  externalProjects,
  filterExternalProjects,
} from "@/lib/navigation/external-projects";
import {
  hasProjectNotes,
  projectNotesHref,
  projectNotesProjectSlug,
} from "@/lib/project-notes";

/* -------------------------------------------------------------------------
 * 프로젝트 트리 사이드바 — 프로젝트 → 명심할 점 또는 카테고리 → 차트.
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

/*
 * 모든 행이 같은 12px 글자 크기·32px 높이를 쓴다. 층위는 오직 들여쓰기와
 * 굵기·색으로만 구분한다 (한글 제목이라 uppercase·tracking 은 의미가 없다).
 *
 * 글자 시작 위치는 단계당 12px:
 *   프로젝트 32px · 카테고리 44px · 차트 56px
 * (mx-2 8px + pl-* + 셰브런 10px + gap-1.5 6px 의 합)
 */
const ROW =
  "mx-2 flex h-8 items-center gap-1.5 rounded-[3px] pr-2 text-[12px] transition";
/** button 은 w:auto 가 fit-content 라 폭을 직접 준다 (좌우 mx-2 = 1rem 제외). */
const ROW_BTN = `${ROW} w-[calc(100%-1rem)]`;

/** 들여쓰기(pl-*)는 호출부가 붙인다 — 트리 밖 링크는 pl-2, 차트는 pl-12. */
const linkCls = (active: boolean) =>
  `${ROW} ${
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
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      // 형태까지 확인한다. 유효한 JSON 이어도 객체가 아니면(`5`, `[]`, `null`)
      // 아래 `key in overrides` 가 던져서 사이드바째 렌더가 죽는다.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setUserOverrides(parsed as Record<string, boolean>);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: Record<string, boolean>) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota 에러 무시 */
    }
  };

  const toggle = (key: string, currentlyCollapsed: boolean) => {
    setUserOverrides((prev) => {
      const next = { ...prev, [key]: !currentlyCollapsed };
      persist(next);
      return next;
    });
  };

  // 현재 보고 있는 위치 — 명심할 점 페이지 또는 차트 폴백 규칙으로 판정.
  const active = useMemo(() => {
    const notesProjectSlug = projectNotesProjectSlug(pathname);
    if (notesProjectSlug) {
      const project = flowProjects.find((p) => p.slug === notesProjectSlug);
      if (!project) return null;
      return {
        project: project.slug,
        category: null,
        chart: null,
        view: "notes" as const,
      };
    }
    const m = pathname.match(/^\/flows\/([^/]+)$/);
    if (!m) return null;
    const project = flowProjects.find((p) => p.slug === m[1]);
    if (!project) return null;
    const resolved = resolveChart(
      project,
      searchParams.get("cat") ?? undefined,
      searchParams.get("chart") ?? undefined
    );
    if (!resolved) return null;
    return {
      project: project.slug,
      category: resolved.category.slug,
      chart: resolved.chart.slug,
      view: "chart" as const,
    };
  }, [pathname, searchParams]);

  // 다른 차트로 이동하면 그 조상의 접힘 override 를 지운다. 접어둔 프로젝트의
  // 차트로 갔을 때 정작 보고 있는 차트가 트리에서 사라지는 걸 막는다.
  // (override 를 무시하는 게 아니라 지우는 것이라, 이동 후 다시 접을 수 있다.)
  useEffect(() => {
    if (!active) return;
    const pKey = projectKey(active.project);
    const cKey = active.category
      ? categoryKey(active.project, active.category)
      : null;
    setUserOverrides((prev) => {
      if (!prev[pKey] && (!cKey || !prev[cKey])) return prev;
      const next = { ...prev };
      delete next[pKey];
      if (cKey) delete next[cKey];
      persist(next);
      return next;
    });
    // active 객체는 매 렌더 새로 만들어지므로 식별자만 의존한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.project, active?.category, active?.chart]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // 검색 중이면 프로젝트명·명심할 점·차트 중 매칭되는 메뉴만 남긴다.
  const visibleProjects = useMemo(() => {
    if (!searching) {
      return flowProjects.map((p) => ({
        project: p,
        categories: p.categories,
        showNotes: hasProjectNotes(p.slug),
      }));
    }
    return flowProjects
      .map((p) => {
        const projectMatches = p.title.toLowerCase().includes(q);
        const showNotes =
          hasProjectNotes(p.slug) &&
          (projectMatches || "명심할 점 주의사항 우선순위".includes(q));
        const categories = projectMatches
          ? p.categories
          : p.categories
              .map((c) => ({
                ...c,
                charts: c.charts.filter((ch) => chartMatches(ch, q)),
              }))
              .filter((c) => c.charts.length > 0);
        return { project: p, categories, showNotes };
      })
      .filter((p) => p.showNotes || p.categories.length > 0);
  }, [searching, q]);

  const visibleExternalProjects = useMemo(
    () => filterExternalProjects(externalProjects, q),
    [q]
  );

  return (
    <nav className="flex h-full flex-col gap-2 overflow-y-auto py-3 [&>*]:shrink-0">
      <Link href="/today" className={`${linkCls(pathname === "/today")} pl-2`}>
        오늘의 할 일
      </Link>
      <Link
        href="/flows"
        className={`-mt-1 ${linkCls(pathname === "/flows")} pl-2`}
      >
        전체 프로젝트
      </Link>
      <Link
        href="/guide"
        className={`-mt-1 ${linkCls(pathname === "/guide")} pl-2`}
      >
        작성 가이드
      </Link>

      <div className="mx-2 flex items-center gap-1.5 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2">
        <HiOutlineSearch size={12} className="shrink-0 text-[var(--bi-muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="메뉴 검색"
          aria-label="메뉴 검색"
          className="h-7 w-full bg-transparent text-[12px] text-[var(--bi-fg)] outline-none placeholder:text-[var(--bi-muted)]"
        />
      </div>

      {searching &&
      visibleProjects.length === 0 &&
      visibleExternalProjects.length === 0 ? (
        <p className="mx-4 my-1 text-[11px] text-[var(--bi-muted)]">
          일치하는 메뉴 없음
        </p>
      ) : null}

      {visibleProjects.map(({ project, categories, showNotes }) => {
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
              className={`${ROW_BTN} pl-2 font-semibold text-[var(--bi-fg)] hover:bg-[var(--bi-sidebar-active)]`}
            >
              <HiChevronRight
                size={10}
                className={`shrink-0 transition-transform ${
                  pCollapsed ? "rotate-0" : "rotate-90"
                }`}
              />
              <span className="truncate">{project.title}</span>
              {/* 검색 중에는 필터링된 개수 — 카테고리 배지와 셈법이 같아야 한다 */}
              <span className="ml-auto font-normal text-[var(--bi-muted)]">
                {categories.reduce((n, c) => n + c.charts.length, 0)}
              </span>
            </button>

            {!pCollapsed ? (
              <>
                {showNotes ? (
                  <Link
                    aria-label={`${project.title} 명심할 점`}
                    aria-current={
                      projectActive && active?.view === "notes"
                        ? "page"
                        : undefined
                    }
                    className={`${linkCls(projectActive && active?.view === "notes")} pl-5`}
                    href={projectNotesHref(project.slug)}
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bi-warning)]"
                    />
                    <span className="truncate">명심할 점</span>
                  </Link>
                ) : null}
                {categories.map((category) => {
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
                        className={`${ROW_BTN} pl-5 font-medium text-[var(--bi-muted)] hover:bg-[var(--bi-sidebar-active)] hover:text-[var(--bi-fg)]`}
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
                                className={`${linkCls(isActive)} pl-12`}
                              >
                                <span className="truncate">{chart.title}</span>
                              </Link>
                            );
                          })
                        : null}
                    </div>
                  );
                })}
              </>
            ) : null}
          </div>
        );
      })}

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
    </nav>
  );
}
