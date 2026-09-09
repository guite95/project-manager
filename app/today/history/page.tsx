import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { CompletionHistory } from "@/components/today-board/completion-history";

export const metadata: Metadata = {
  title: "완료 이력 — 프로젝트 매니지먼트",
  description: "날짜별로 완료한 항목을 봅니다.",
};

export default function TodayHistoryPage() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description="날짜별로 완료한 항목을 봅니다. 체크한 순간의 날짜로 쌓입니다."
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
        <CompletionHistory />
      </div>
    </div>
  );
}
