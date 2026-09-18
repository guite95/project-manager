import { isPersonalProject } from "@/lib/personal-projects";
import { accessibleCatalog } from '@/lib/access/catalog';
import { flowCategories } from "@/lib/server/flow-catalog-store";
import { meetingsHref } from "@/lib/meetings";
import { materialsHref } from "@/lib/materials";
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
  `border-b-2 px-3 py-2 text-[12px] font-semibold transition ${
    active
      ? "border-[var(--bi-accent)] text-[var(--bi-accent)]"
      : "border-transparent text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"
  }`;

function ViewTabs({ view }: { view: FlowsView }) {
  return (
    <nav
      aria-label="전체 프로젝트 보기"
      className="mb-6 flex border-b border-[var(--bi-border)]"
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
  const flowProjects = (await accessibleCatalog()).filter(project => !isPersonalProject(project.slug));
  return (
    <>
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

          {project.slug !== "common" ? <Link href={meetingsHref(project.slug)} className="mt-3 flex flex-col gap-1 rounded-[3px] border border-[var(--bi-border)] px-3.5 py-3 hover:border-[var(--bi-accent)]">
            <span className="text-[13px] font-semibold">회의록</span>
            <span className="text-[12px] text-[var(--bi-muted)]">회의 내용·결정 사항·태스크과 전사본 원문</span>
          </Link> : null}
          {project.slug !== "common" ? <Link href={materialsHref(project.slug)} className="mt-3 flex flex-col gap-1 rounded-[3px] border border-[var(--bi-border)] px-3.5 py-3 hover:border-[var(--bi-accent)]">
            <span className="text-[13px] font-semibold">자료</span>
            <span className="text-[12px] text-[var(--bi-muted)]">PDF·HTML 문서 추가와 미리보기</span>
          </Link> : null}
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
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <h1 className="mt-0 mb-2 text-[22px] font-bold tracking-[-0.01em] text-[var(--bi-fg)]">
        전체 프로젝트
      </h1>
      <p className="my-3 text-[13px] leading-[1.7] text-[var(--bi-fg)]">
        프로젝트 진행 흐름과 앞으로 재사용할 공통 UI 컴포넌트를 한곳에서
        확인합니다.
      </p>
      <ViewTabs view={view} />

      {view === "projects" ? (
        <ProjectsOverview />
      ) : (
        <UiReferenceGallery />
      )}
    </div>
  );
}
