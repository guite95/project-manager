import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectEditor } from "@/components/projects/project-editor";

export const metadata: Metadata = {
  title: "개인 프로젝트 — 프로젝트 매니지먼트",
  description: "프로젝트별 자료와 작업 기록을 관리합니다.",
};

export default function PersonalPage() {
  return <div className="mx-auto max-w-[1200px]">
    <PageHeader title="개인 프로젝트" description="프로젝트별 자료와 작업 기록을 관리합니다." actions={<ProjectEditor scope="PERSONAL" />} />
    <p className="px-6 py-8 text-sm leading-7 text-[var(--bi-muted)]">프로젝트 메뉴에서 작업할 프로젝트를 선택하세요. 각 프로젝트의 ‘기록’에서 프로젝트 개요와 작업별 경험을 정리할 수 있습니다.</p>
  </div>;
}
