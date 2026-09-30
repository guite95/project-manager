import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { RecruitmentWorkspace } from "@/components/recruitment/recruitment-workspace";
import { RecruitmentCredentialsPanel } from "@/components/recruitment/recruitment-credentials";

export const metadata: Metadata = {
  title: "포트폴리오 — 프로젝트 매니지먼트",
  description: "소개와 경력, 대표 프로젝트와 성과를 정리하는 공간입니다.",
};

export default function PortfolioPage() {
  return (
    <div className="min-w-0 w-full">
      <PageHeader title="포트폴리오" description="소개와 경력, 대표 프로젝트와 성과를 정리하는 공간입니다." />
      <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 md:mx-6">
        <div><p className="text-sm font-semibold">외부 공유용 포트폴리오</p><p className="mt-1 text-xs text-[var(--bi-muted)]">소개와 대표 프로젝트를 별도로 편집해 로그인 없이 공유할 수 있습니다.</p></div>
        <Link href="/portfolio/public" className="rounded bg-[var(--bi-accent)] px-4 py-2 text-xs text-white">공개 포트폴리오 관리</Link>
      </div>
      <RecruitmentCredentialsPanel />
      <RecruitmentWorkspace kind="PORTFOLIO" />
    </div>
  );
}
