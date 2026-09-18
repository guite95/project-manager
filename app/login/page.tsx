import type { Metadata } from "next";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "로그인 — 프로젝트 매니지먼트",
};

export default async function LoginPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const unavailable=(await searchParams).error==='auth-unavailable';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bi-bg)] px-6">
      <h1 className="text-[15px] font-semibold text-[var(--bi-fg)]">
        프로젝트 매니지먼트
      </h1>
      {unavailable&&<p role="alert" className="max-w-[320px] text-[12px] text-[var(--bi-error)]">현재 로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의하세요.</p>}
      <LoginForm />
    </div>
  );
}
