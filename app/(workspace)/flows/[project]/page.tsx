import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { meetingsHref } from "@/lib/meetings";
import { FlowLegend } from "@/components/flow/flow-legend";
import { ProcessFlow } from "@/components/flow/process-flow";
import { ErdViewer } from "@/components/flow/erd-viewer";
import { ChartSelector } from "@/components/flow/chart-selector";
import { ProjectContentView } from "@/components/flow/project-content";
import { RichText } from "@/components/rich-text";
import { getTnsErdSnapshot } from "@/lib/server/flows-store";
import { getChartPage } from "@/lib/server/flow-catalog-store";

type PageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `?cat=a&cat=b` 처럼 같은 키가 여러 번 오면 배열로 들어온다. 첫 값만 쓴다 —
 * 사이드바의 `URLSearchParams.get()` 과 같은 규칙이라야 활성 표시가 어긋나지
 * 않는다.
 */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}


export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { project: projectSlug } = await params;
  const sp = await searchParams;
  const resolved = await getChartPage(projectSlug, first(sp.cat), first(sp.chart));
  if (!resolved) return {};
  const { project } = resolved;
  return {
    title: `${resolved.chart.title} — ${project.title} — 프로젝트 매니지먼트`,
    description: resolved.chart.description,
  };
}

export default async function ProjectFlowsPage({
  params,
  searchParams,
}: PageProps) {
  const { project: projectSlug } = await params;
  const sp = await searchParams;
  // 잘못된 cat/chart는 첫 차트로 폴백하며, 그래프 본문은 선택한 한 장만 읽는다.
  const resolved = await getChartPage(projectSlug, first(sp.cat), first(sp.chart));
  if (!resolved) notFound();
  const { project, category, chart } = resolved;
  if (chart.content?.kind === 'meeting') redirect(meetingsHref(project.slug, chart.slug));
  if (category.slug === 'meetings' && chart.slug === 'meetings' && chart.content?.kind === 'notice') redirect(meetingsHref(project.slug));

  return (
    <>
      <ChartSelector key={`${project.slug}/${category.slug}/${chart.slug}`} projectSlug={project.slug} projectTitle={project.title}
        categorySlug={category.slug} categoryTitle={category.title} selectedSlug={chart.slug}
        charts={category.charts.map(({ slug, title, description, erdDomain, contentKind }) => ({ slug, title, description, erdDomain, contentKind }))} />
    <div className="mx-auto max-w-[1200px] px-4 py-5 md:px-6 md:py-6">
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

      <h2 className="mt-0 mb-1 text-[17px] font-bold tracking-[-0.01em] text-[var(--bi-fg)]">
        {chart.title}
      </h2>
      {chart.description ? (
        <p className="m-0 mb-3 text-[12px] leading-[1.6] text-[var(--bi-muted)]">
          {chart.description}
        </p>
      ) : null}

      {chart.content ? (
        <ProjectContentView key={chart.slug} chart={chart} />
      ) : chart.erdDomain ? (
        <ErdViewer key={chart.erdDomain} domain={chart.erdDomain} snapshot={await getTnsErdSnapshot()} />
      ) : (
        <>
          <div className="mb-3"><FlowLegend chart={chart} /></div>
          <ProcessFlow chart={chart} height={560} />
        </>
      )}

      {chart.source ? <p className="mt-4 text-[11px] text-[var(--bi-muted)]">레퍼런스 콘텐츠 · 가져온 날짜 {chart.source.capturedAt.slice(0, 10)}</p> : null}
      {chart.howToRead?.length ? (
        <section className="mt-5">
          <h3 className="mt-0 mb-2 text-[14px] font-semibold text-[var(--bi-fg)]">
            읽는 법
          </h3>
          <ul className="m-0 list-disc space-y-1.5 pl-5 text-[13px] leading-[1.7] text-[var(--bi-fg)]">
            {chart.howToRead.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
    </>
  );
}
