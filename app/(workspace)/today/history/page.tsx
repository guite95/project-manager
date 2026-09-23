import { listFlowProjectNames } from "@/lib/server/flows-store";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { CompletionHistory } from "@/components/today-board/completion-history";

export const metadata: Metadata = {
  title: "완료 이력 — 프로젝트 매니지먼트",
  description: "날짜별로 완료한 항목을 봅니다.",
};

import { WorkSummaryHistory } from "@/components/today-board/work-summary-history";
import {
  listWorkSummaryDates,
  loadWorkSummary,
} from "@/lib/server/work-summary-store";
import { todayInSeoul } from "@/lib/format/date-time";
import { validWorkDate } from "@/lib/work-summary";

export default async function TodayHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const query = await searchParams;
  const summaryView = query.view === "summary";
  const dates = summaryView ? await listWorkSummaryDates() : [];
  const date = validWorkDate(query.date)
    ? query.date
    : (dates[0] ?? todayInSeoul());
  const report = summaryView ? await loadWorkSummary(date) : null;
  const flowProjects = await listFlowProjectNames();
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description="완료 체크 기록과 Git 작업을 모아 정리한 내용을 날짜별로 봅니다."
        title="완료 이력"
      />
      <div className="px-6 py-5">
        <nav
          aria-label="위치"
          className="mb-3 flex items-center gap-1.5 text-[11px] text-[var(--bi-muted)]"
        >
          <Link className="hover:underline" href="/today">
            오늘의 할 일
          </Link>
          <span aria-hidden>›</span>
          <span className="font-semibold text-[var(--bi-fg)]">완료 이력</span>
        </nav>
        <nav
          aria-label="완료 이력 보기"
          className="mb-5 flex gap-4 border-b border-[var(--bi-border)] text-[13px]"
        >
          {[
            {
              title: "완료 기록",
              href: "/today/history",
              active: !summaryView,
            },
            {
              title: "작업 정리",
              href: "/today/history?view=summary",
              active: summaryView,
            },
          ].map((tab) => (
            <Link
              key={tab.title}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`border-b-2 px-1 py-2 ${tab.active ? "border-[var(--bi-accent)] font-semibold text-[var(--bi-accent)]" : "border-transparent text-[var(--bi-muted)]"}`}
            >
              {tab.title}
            </Link>
          ))}
        </nav>
        {summaryView ? (
          <WorkSummaryHistory
            key={`${date}:${report?.revision ?? 0}`}
            report={report}
            date={date}
            dates={dates}
            companyProjectKeys={flowProjects.filter(project => project.scope === "COMPANY").map(project => `app:${project.slug}`)}
          />
        ) : (
          <CompletionHistory flowProjects={flowProjects} />
        )}
      </div>
    </div>
  );
}
