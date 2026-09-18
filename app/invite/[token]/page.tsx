import type { Metadata } from "next";
import Link from "next/link";
import { PasswordForm } from "@/components/access/password-form";

export const metadata: Metadata = { title: "초대 수락 — 프로젝트 매니지먼트", robots: { index: false, follow: false } };
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bi-bg)] px-6 text-[var(--bi-fg)]">
    <h1 className="text-lg font-semibold">프로젝트 매니지먼트 초대</h1>
    <p className="max-w-md text-[13px] text-[var(--bi-muted)]">사용할 비밀번호를 설정해 초대를 수락하세요. 초대 링크는 발급 후 48시간 동안 유효합니다.</p>
    <PasswordForm token={token} />
    <Link href="/login" className="text-[12px] text-[var(--bi-accent)]">로그인으로 돌아가기</Link>
  </main>;
}
