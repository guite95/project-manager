import type { Metadata } from "next";
import Link from "next/link";
import { flowCategories } from "@/lib/flows/registry";

export const metadata: Metadata = {
  title: "플로우차트 — 프로젝트 매니지먼트",
  description: "프로젝트 진행 흐름을 한 장으로 정리한 플로우차트 모음",
};

export default function FlowsIndexPage() {
  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <h1 className="mt-0 mb-2 text-[22px] font-bold tracking-[-0.01em] text-[var(--bi-fg)]">
        플로우차트
      </h1>
      <p className="my-3 text-[13px] leading-[1.7] text-[var(--bi-fg)]">
        프로젝트 진행 흐름을 한 장으로 정리한 다이어그램 모음입니다. 좌측 메뉴나
        아래 카드에서 항목을 선택하세요. 색 범례는 차트마다 다르므로 각 상세
        화면에 있습니다.
      </p>

      {flowCategories.map((category) => (
        <section key={category.title} className="mt-8">
          <h2 className="mt-0 mb-3 border-t border-[var(--bi-border)] pt-6 text-[16px] font-semibold tracking-[-0.005em] text-[var(--bi-fg)]">
            {category.title}
          </h2>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {category.charts.map((chart) => (
              <Link
                key={chart.slug}
                href={`/flows/${chart.slug}`}
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
        </section>
      ))}
    </div>
  );
}
