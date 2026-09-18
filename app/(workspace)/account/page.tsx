import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import { PasswordForm } from "@/components/access/password-form";

export const metadata: Metadata = { title: "내 계정 — 프로젝트 매니지먼트" };
export default function AccountPage() {
  return <div className="mx-auto max-w-[1200px]"><PageHeader title="내 계정" description="비밀번호를 변경하면 다른 기기의 로그인 세션이 종료됩니다." /><div className="px-6 py-8"><PasswordForm /></div></div>;
}
