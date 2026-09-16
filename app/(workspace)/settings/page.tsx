import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";

export const metadata: Metadata = {
  title: "설정 — 프로젝트 매니지먼트",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="설정" description="설정 공간입니다." />
      <div className="px-6 py-8">
        <div className="rounded-[3px] border border-dashed border-[var(--bi-border)] px-6 py-12 text-center">
          <h3 className="text-[14px] font-semibold">준비 중</h3>
          <p className="mt-2 text-[12px] text-[var(--bi-muted)]">아직 등록된 메뉴가 없습니다.</p>
        </div>
      </div>
    </div>
  );
}
