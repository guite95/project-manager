import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { RecruitmentWorkspace } from "@/components/recruitment/recruitment-workspace";

export const metadata: Metadata = {
  title: "포트폴리오 — 프로젝트 매니지먼트",
  description: "소개와 경력, 대표 프로젝트와 성과를 정리하는 공간입니다.",
};

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="포트폴리오" description="소개와 경력, 대표 프로젝트와 성과를 정리하는 공간입니다." />
      <RecruitmentWorkspace kind="PORTFOLIO" />
    </div>
  );
}
