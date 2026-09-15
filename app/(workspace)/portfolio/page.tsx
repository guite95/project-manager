import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";

export const metadata: Metadata = {
  title: "포트폴리오 — 프로젝트 매니지먼트",
  description: "소개와 경력, 대표 프로젝트와 성과를 정리하는 공간입니다.",
};

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="포트폴리오" description="소개와 경력, 대표 프로젝트와 성과를 정리하는 공간입니다." />
      <div className="px-6 py-8">
        <div className="rounded-[3px] border border-dashed border-[var(--bi-border)] px-6 py-12 text-center">
          <h3 className="text-[14px] font-semibold">포트폴리오 공간을 준비하고 있어요</h3>
          <p className="mt-2 text-[12px] text-[var(--bi-muted)]">소개와 경력, 프로젝트별 역할과 성과를 정리하는 기능이 추가될 예정입니다.</p>
        </div>
      </div>
    </div>
  );
}
