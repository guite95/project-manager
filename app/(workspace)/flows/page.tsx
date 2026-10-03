import { ProjectEditor } from "@/components/projects/project-editor";
import { PageHeader } from "@/components/erp/page-header";
import { isPersonalProject } from "@/lib/personal-projects";
import { accessibleCatalog } from '@/lib/access/catalog';
import { flowCategories } from "@/lib/server/flow-catalog-store";
import { meetingsHref } from "@/lib/meetings";
import { materialsHref } from "@/lib/materials";
import { recordingsHref } from "@/lib/recordings";
import type { Metadata } from "next";
import Link from "next/link";
import { RichText } from "@/components/rich-text";
import { UiReferenceGallery } from "@/components/ui-reference/ui-reference-gallery";
import { chartHref } from "@/lib/flows/registry";
import {
  resolveFlowsView,
  type FlowsView,
} from "@/lib/ui-reference/view";

export const metadata: Metadata = {
  title: "전체 프로젝트 — 프로젝트 매니지먼트",
  description: "프로젝트 플로우차트와 공통 UI 컴포넌트 모음",
};

const tabClassName = (active: boolean) =>
  `inline-flex min-h-11 items-center border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
    active
      ? "border-[var(--bi-accent)] text-[var(--bi-accent)]"
      : "border-transparent text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"
  }`;

function ViewTabs({ view }: { view: FlowsView }) {
  return (
    <nav
      aria-label="전체 프로젝트 보기"
      className="flex gap-3 border-b border-[var(--bi-border)] px-4 sm:px-6"
    >
      <Link
        aria-current={view === "projects" ? "page" : undefined}
        className={tabClassName(view === "projects")}
        href="/flows"
      >
        프로젝트
      </Link>
      <Link
        aria-current={view === "components" ? "page" : undefined}
        className={tabClassName(view === "components")}
        href="/flows?view=components"
      >
        UI 컴포넌트
      </Link>
    </nav>
  );
}

async function ProjectsOverview() {
  const flowProjects = (await accessibleCatalog()).filter(project => !isPersonalProject(project));
  return (
    <>
      {flowProjects.map((project) => (
        <section key={project.slug} className="border-b border-[var(--bi-border)] py-6 first:pt-0 last:border-b-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-[17px] font-semibold tracking-[-0.015em] text-[var(--bi-fg)]">{project.title}</h2>
            <ProjectEditor scope="COMPANY" slug={project.slug} />
          </div>
          {project.intro ? (
            <p className="m-0 mb-4 max-w-[75ch] text-[13px] leading-[1.7] text-[var(--bi-muted)]">
              <RichText text={project.intro} />
            </p>
          ) : null}

          {project.slug !== "common" ? <nav aria-label={`${project.title} 자료와 기록`} className="mb-5 grid gap-2 sm:grid-cols-3">
          <Link href={meetingsHref(project.slug)} className="bi-project-link flex flex-col gap-1 px-4 py-3">
            <span className="text-[13px] font-semibold">회의록</span>
            <span className="text-[12px] text-[var(--bi-muted)]">회의 내용·결정 사항·태스크와 전사본</span>
          </Link>
          <Link href={materialsHref(project.slug)} className="bi-project-link flex flex-col gap-1 px-4 py-3">
            <span className="text-[13px] font-semibold">자료</span>
            <span className="text-[12px] text-[var(--bi-muted)]">PDF·HTML·PPTX 문서 추가와 미리보기</span>
          </Link>
          <Link href={recordingsHref(project.slug)} className="bi-project-link flex flex-col gap-1 px-4 py-3">
            <span className="text-[13px] font-semibold">녹음·전사</span>
            <span className="text-[12px] text-[var(--bi-muted)]">녹음 종류 선택·자동 전사·원본과 전사본 다운로드</span>
          </Link>
          </nav> : null}
          {flowCategories(project.categories).map((category) => (
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
                    className="bi-project-link group flex flex-col gap-1 px-4 py-3"
                  >
                    <span className="text-[13px] font-semibold text-[var(--bi-fg)]">
                      {chart.title}
                    </span>
                    {chart.description ? (
                      <span className="text-[12px] leading-[1.6] text-[var(--bi-muted)]">
                        {chart.description}
                      </span>
                    ) : null}
                    <span className="mt-2 text-[12px] text-[var(--bi-muted)]">
                      노드 {chart.nodeCount} · 연결 {chart.edgeCount}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

export default async function FlowsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const view = resolveFlowsView((await searchParams).view);

  return (
    <div className="min-w-0 w-full">
      <PageHeader title="전체 프로젝트" description="프로젝트 진행 흐름과 자료, 공통 UI 컴포넌트를 한곳에서 확인합니다." actions={view === "projects" ? <ProjectEditor scope="COMPANY" /> : undefined} />
      <ViewTabs view={view} />
      <div className="px-4 py-6 sm:px-6">
      {view === "projects" ? (
        <ProjectsOverview />
      ) : (
        <UiReferenceGallery />
      )}
      </div>
    </div>
  );
}
