"use client";

import Link from "next/link";
import { ProjectGroupSelect, usePersonalProjectGroups } from "@/components/personal/project-groups";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  HiOutlineExternalLink,
  HiOutlineSearch,
} from "react-icons/hi";
import { putSidebarOrder } from "@/lib/api-client";
import { defaultSidebarOrder, normalizeSidebarOrder, moveSidebarProject, mergeSidebarGroupOrder } from "@/lib/navigation/sidebar-order";
import { SidebarProject } from "./sidebar-project";
import type { FlowNavigationProject } from "@/lib/navigation/flow-navigation";
import { chartHref, resolveChart } from "@/lib/flows/registry";
import {
  externalProjects,
  filterExternalProjects,
} from "@/lib/navigation/external-projects";
import {
  projectNotesHref,
  projectNotesProjectSlug,
} from "@/lib/project-notes";

import { searchSidebarProjects } from "@/lib/navigation/sidebar-search";
import { meetingsHref } from "@/lib/meetings";
import { materialsHref } from "@/lib/materials";
import { recordingsHref } from "@/lib/recordings";

import { isPersonalProject, personalProjectGroup, personalProjectGroups } from "@/lib/personal-projects";

const ROW = "mx-2 flex min-h-10 md:min-h-9 items-center gap-2 rounded-[3px] px-2 text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]";
const linkCls = (active: boolean) => `${ROW} ${active
  ? "bg-[var(--bi-accent)] font-semibold text-white"
  : "text-[var(--bi-muted)] hover:bg-[var(--bi-sidebar-active)] hover:text-[var(--bi-fg)]"}`;

export function AppSidebar({ flowProjects, projectOrder, onProjectOrderChange, inline = false, personal = false }: {
  flowProjects: FlowNavigationProject[];
  projectOrder: string[];
  onProjectOrderChange: (order: string[]) => void;
  inline?: boolean;
  personal?: boolean;
}) {
  const groupPreferences = usePersonalProjectGroups();
  const groupFor = (slug: string) => personalProjectGroup(slug, groupPreferences.values);
  const pathname = usePathname();
  const visibleExternal = personal ? [] : externalProjects;
  const overviewHref = personal ? "/personal" : "/flows";
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const setProjectOrder = onProjectOrderChange;
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const savingOrderRef = useRef(false);
  const order = normalizeSidebarOrder(
    defaultSidebarOrder(flowProjects.map((p) => p.slug), visibleExternal.map((p) => p.slug)),
    projectOrder,
  );

  const saveOrder = async (next: string[]) => {
    if (savingOrderRef.current || next === order) return;
    savingOrderRef.current = true;
    const previous = projectOrder;
    const merged = mergeSidebarGroupOrder(projectOrder, next);
    setProjectOrder(merged);
    setSavingOrder(true);
    setOrderError("");
    setAnnouncement("프로젝트 순서를 저장하는 중입니다.");
    try {
      setProjectOrder(await putSidebarOrder(merged));
      setAnnouncement("프로젝트 순서를 저장했습니다.");
    } catch {
      setProjectOrder(previous);
      setOrderError("순서를 저장하지 못해 이전 순서로 되돌렸습니다. 다시 시도해 주세요.");
      setAnnouncement("");
    } finally {
      savingOrderRef.current = false;
      setSavingOrder(false);
    }
  };

  const moveProject = (slug: string, target: string, edge: "before" | "after") => {
    if (query.trim()) return;
    if (personal && groupFor(slug) !== groupFor(target)) return;
    void saveOrder(moveSidebarProject(order, slug, target, edge));
  };
  const stepProject = (slug: string, step: -1 | 1) => {
    const groupOrder = personal ? order.filter(item => groupFor(item) === groupFor(slug)) : order;
    const target = groupOrder[groupOrder.indexOf(slug) + step];
    if (target) moveProject(slug, target, step < 0 ? "before" : "after");
  };
  const toggle = (slug: string) => setExpandedProject(current => current === slug ? null : slug);

  // 현재 보고 있는 위치 — 명심할 점 페이지 또는 차트 폴백 규칙으로 판정.
  const active = useMemo(() => {
    const recordingPath = pathname.match(/^\/flows\/([^/]+)\/recordings$/);
    if (recordingPath && flowProjects.some(p => p.slug === recordingPath[1])) {
      return { project: recordingPath[1], category: null, chart: null, view: "recordings" as const };
    }
    const materialPath = pathname.match(/^\/flows\/([^/]+)\/materials(?:\/[^/]+)?$/);
    if (materialPath && flowProjects.some(p => p.slug === materialPath[1])) {
      return { project: materialPath[1], category: null, chart: null, view: "materials" as const };
    }
    const meetingPath = pathname.match(/^\/flows\/([^/]+)\/meetings(?:\/[^/]+)?$/);
    if (meetingPath && flowProjects.some(p => p.slug === meetingPath[1])) {
      return { project: meetingPath[1], category: null, chart: null, view: "meetings" as const };
    }
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
  }, [pathname, searchParams, flowProjects]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const visibleProjects = useMemo(() => searchSidebarProjects(flowProjects, q), [flowProjects, q]);

  const visibleExternalProjects = useMemo(
    () => filterExternalProjects(personal ? [] : externalProjects, q),
    [q, personal]
  );

  const renderProject = (entry: (typeof visibleProjects)[number]) => {
    const { project, categories, showNotes, showMeetings, showMaterials, showRecordings } = entry;
    const projectActive = active?.project === project.slug;
    const pCollapsed = expandedProject !== project.slug;

    return (
      <SidebarProject
        key={project.slug}
        slug={project.slug}
        title={project.title}
        count={categories.reduce((n, c) => n + c.charts.length, 0)}
        collapsed={pCollapsed}
        onToggle={() => toggle(project.slug)}
        movable={!searching && !savingOrder}
        dragging={dragging}
        onDragChange={setDragging}
        onMove={moveProject}
        onStep={stepProject}
      >
        {!pCollapsed ? (
          <>
            {personal ? <div className="mx-2 my-2"><ProjectGroupSelect slug={project.slug} title={project.title} /></div> : null}
            {showMaterials ? <Link href={materialsHref(project.slug)} aria-label={`${project.title} 자료`}
              aria-current={projectActive && active?.view === "materials" ? "page" : undefined}
              className={linkCls(projectActive && active?.view === "materials")}>자료</Link> : null}
            {showMeetings ? <Link href={meetingsHref(project.slug)} aria-label={`${project.title} 회의록`}
              aria-current={projectActive && active?.view === "meetings" ? "page" : undefined}
              className={linkCls(projectActive && active?.view === "meetings")}>회의록</Link> : null}
            {showRecordings ? <Link href={recordingsHref(project.slug)} aria-label={`${project.title} 녹음·전사`}
              aria-current={projectActive && active?.view === "recordings" ? "page" : undefined}
              className={linkCls(projectActive && active?.view === "recordings")}>녹음·전사</Link> : null}
            {showNotes ? (
              <Link
                aria-label={`${project.title} ${isPersonalProject(project.slug) ? "기록" : "명심할 점"}`}
                aria-current={
                  projectActive && active?.view === "notes"
                    ? "page"
                    : undefined
                }
                className={linkCls(projectActive && active?.view === "notes")}
                href={projectNotesHref(project.slug)}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bi-warning)]"
                />
                <span className="truncate">{isPersonalProject(project.slug) ? "기록" : "명심할 점"}</span>
              </Link>
            ) : null}
            {categories.map((category) => {
              const categoryActive = projectActive && active?.category === category.slug;
              const firstChart = category.charts[0];
              if (!firstChart) return null;
              const destination = categoryActive
                ? category.charts.find(chart => chart.slug === active?.chart) ?? firstChart
                : firstChart;
              return (
                <div key={category.slug}>
                  <Link
                    href={chartHref(project.slug, category.slug, destination.slug)}
                    aria-current={categoryActive ? "page" : undefined}
                    className={linkCls(categoryActive)}
                    title={category.title}
                  >
                    <span className="min-w-0 flex-1 truncate">{category.title}</span>
                    <span className="shrink-0 text-[10px] opacity-70">{category.charts.length}</span>
                  </Link>
                  {searching ? category.charts.map(chart => (
                    <Link
                      key={chart.slug}
                      href={chartHref(project.slug, category.slug, chart.slug)}
                      className="mx-2 flex flex-col gap-0.5 rounded-[3px] px-3 py-2 text-[11px] text-[var(--bi-muted)] hover:bg-[var(--bi-sidebar-active)] focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]"
                    >
                      <span className="truncate font-medium text-[var(--bi-fg)]">{chart.title}</span>
                      {chart.description ? <span className="truncate">{chart.description}</span> : null}
                    </Link>
                  )) : null}
                </div>
              );
            })}
          </>
        ) : null}
      </SidebarProject>
    );
  };

  const renderExternalProject = (project: (typeof externalProjects)[number]) => {
    const pCollapsed = expandedProject !== project.slug;

    return (
      <SidebarProject
        key={project.slug}
        slug={project.slug}
        title={project.title}
        count={project.links.length}
        collapsed={pCollapsed}
        onToggle={() => toggle(project.slug)}
        movable={!searching && !savingOrder}
        dragging={dragging}
        onDragChange={setDragging}
        onMove={moveProject}
        onStep={stepProject}
      >
        {!pCollapsed
          ? project.links.map((externalLink) => (
              <a
                key={externalLink.href}
                href={externalLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkCls(false)}
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
      </SidebarProject>
    );
  };

  return (
    <nav aria-label="프로젝트 상세 메뉴" className={inline ? "flex flex-col" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
      <div className="shrink-0 border-b border-[var(--bi-border)] p-3">
        <label className="flex items-center gap-2 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2.5 focus-within:border-[var(--bi-accent)]">
          <HiOutlineSearch size={14} aria-hidden className="shrink-0 text-[var(--bi-muted)]" />
          <span className="sr-only">프로젝트·구조도 검색</span>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="프로젝트·구조도 검색"
            className="h-9 min-w-0 w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--bi-muted)]" />
        </label>
      </div>
      <div className={inline ? "py-2" : "min-h-0 flex-1 overflow-y-auto py-2"}>
        {!searching ? <Link href={overviewHref} aria-current={pathname === overviewHref && searchParams.get("view") !== "components" ? "page" : undefined}
          className={linkCls(pathname === overviewHref && searchParams.get("view") !== "components")}>전체 프로젝트</Link> : null}
      {searching &&
      visibleProjects.length === 0 &&
      visibleExternalProjects.length === 0 ? (
        <p className="mx-4 my-1 text-[11px] text-[var(--bi-muted)]">
          일치하는 메뉴 없음
        </p>
      ) : null}

      <span id="sidebar-order-help" className="sr-only">
        손잡이를 드래그하거나 위·아래 방향키로 프로젝트 순서를 바꿀 수 있습니다. 검색 중에는 순서를 변경할 수 없습니다.
      </span>
      <span role="status" className="sr-only">{announcement}</span>
      {orderError ? <p role="alert" className="mx-4 text-[11px] text-[var(--bi-error)]">{orderError}</p> : null}
      {personal ? personalProjectGroups.map(group => {
        const entries = order.flatMap(slug => {
          const entry = visibleProjects.find(item => item.project.slug === slug);
          return entry && groupFor(slug) === group.id ? [entry] : [];
        });
        if (searching && entries.length === 0) return null;
        return (
          <section key={group.id} aria-label={group.title} className="mt-3">
            <h3 className="mx-4 mb-1 text-[11px] font-semibold text-[var(--bi-muted)]">{group.title}</h3>
            {entries.length ? entries.map(renderProject) : <p className="mx-4 text-[11px] text-[var(--bi-muted)]">등록된 프로젝트가 없습니다.</p>}
          </section>
        );
      }) : order.map((slug) => {
        const flow = visibleProjects.find((entry) => entry.project.slug === slug);
        if (flow) return renderProject(flow);
        const external = visibleExternalProjects.find((project) => project.slug === slug);
        return external ? renderExternalProject(external) : null;
      })}
      </div>
    </nav>
  );
}
