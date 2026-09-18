import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { AccessManager } from "@/components/access/access-manager";

export const metadata: Metadata = { title: "설정 — 프로젝트 매니지먼트" };
export default function Page() {
  return <div className="mx-auto max-w-[1200px]"><PageHeader title="설정" description="계정, 프로젝트 접근 권한과 문서 공유를 관리합니다." /><div className="px-6 py-8"><AccessManager /></div></div>;
}
