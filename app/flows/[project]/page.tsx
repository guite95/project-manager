import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlowLegend } from "@/components/flow/flow-legend";
import { ProcessFlow } from "@/components/flow/process-flow";
import { RichText } from "@/components/rich-text";
import { flowProjects, getProject, resolveChart } from "@/lib/flows/registry";

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
  const project = getProject(projectSlug);
  if (!project) notFound();
  const sp = await searchParams;
  // 잘못된 cat/chart 는 첫 카테고리·첫 차트로 폴백한다 (404 아님).
  // 차트가 하나도 없는 프로젝트만 404 로 떨어진다.
  const resolved = resolveChart(project, first(sp.cat), first(sp.chart));
  if (!resolved) notFound();
  const { category, chart } = resolved;

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
            {chart.howToRead.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
