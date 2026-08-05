import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlowLegend } from "@/components/flow/flow-legend";
import { ProcessFlow } from "@/components/flow/process-flow";
import { allCharts, getChart } from "@/lib/flows/registry";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return allCharts.map((chart) => ({ slug: chart.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const chart = getChart(slug);
  if (!chart) return {};
  return {
    title: `${chart.title} — 프로젝트 매니지먼트`,
    description: chart.description,
  };
}

export default async function FlowDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const chart = getChart(slug);
  if (!chart) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col px-6 py-5">
      <header className="mb-3 shrink-0">
        <h1 className="mt-0 mb-1 text-[18px] font-bold tracking-[-0.01em] text-[var(--bi-fg)]">
          {chart.title}
        </h1>
        {chart.description ? (
          <p className="m-0 mb-2.5 text-[12px] leading-[1.6] text-[var(--bi-muted)]">
            {chart.description}
          </p>
        ) : null}

        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-0.5 text-[11px] text-[var(--bi-muted)] transition hover:border-[var(--bi-accent)] hover:text-[var(--bi-accent)] [&::-webkit-details-marker]:hidden">
            <span className="transition-transform group-open:rotate-90">›</span>
            범례
          </summary>
          <div className="mt-2">
            <FlowLegend chart={chart} />
          </div>
        </details>
      </header>

      <ProcessFlow chart={chart} fill />
    </div>
  );
}
