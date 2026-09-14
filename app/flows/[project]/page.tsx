import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlowLegend } from "@/components/flow/flow-legend";
import { ProcessFlow } from "@/components/flow/process-flow";
import { ErdViewer } from "@/components/flow/erd-viewer";
import { ChartSelector } from "@/components/flow/chart-selector";
import { RichText } from "@/components/rich-text";
import { resolveChart } from "@/lib/flows/registry";
import { getFlowProject, getTnsErdSnapshot } from "@/lib/server/flows-store";

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
  const project = await getFlowProject(projectSlug);
  if (!project) return {};
  const sp = await searchParams;
  const resolved = resolveChart(project, first(sp.cat), first(sp.chart));
  if (!resolved) return {};
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
  const project = await getFlowProject(projectSlug);
  if (!project) notFound();
  const sp = await searchParams;
  // 잘못된 cat/chart 는 첫 카테고리·첫 차트로 폴백한다 (404 아님).
  // 차트가 하나도 없는 프로젝트만 404 로 떨어진다.
  const resolved = resolveChart(project, first(sp.cat), first(sp.chart));
  if (!resolved) notFound();
  const { category, chart } = resolved;

  return (
    <>
      <ChartSelector key={`${project.slug}/${category.slug}/${chart.slug}`} projectSlug={project.slug} projectTitle={project.title}
        categorySlug={category.slug} categoryTitle={category.title} selectedSlug={chart.slug}
        charts={category.charts.map(({ slug, title, description, erdDomain }) => ({ slug, title, description, erdDomain }))} />
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

      {chart.erdDomain ? (
        <ErdViewer key={chart.erdDomain} domain={chart.erdDomain} snapshot={await getTnsErdSnapshot()} />
      ) : (
        <>
          <div className="mb-3"><FlowLegend chart={chart} /></div>
          <ProcessFlow chart={chart} height={560} />
        </>
      )}

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
