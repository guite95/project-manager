import type { Metadata } from "next";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "로그인 — 프로젝트 매니지먼트",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bi-bg)] px-6">
      <h1 className="text-[15px] font-semibold text-[var(--bi-fg)]">
        프로젝트 매니지먼트
      </h1>
      <LoginForm />
    </div>
  );
}
