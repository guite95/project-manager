import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "계정 발급 안내 — 프로젝트 매니지먼트", robots: { index: false, follow: false } };
export default function InvitePage() {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bi-bg)] px-6 text-[var(--bi-fg)]">
    <h1 className="text-lg font-semibold">관리자 발급 계정으로 로그인하세요</h1>
    <p className="max-w-md text-[13px] text-[var(--bi-muted)]">초대 링크는 더 이상 사용하지 않습니다. 관리자에게 발급받은 아이디와 비밀번호로 로그인하세요.</p>
    <Link href="/login" className="text-[12px] text-[var(--bi-accent)]">로그인으로 이동</Link>
  </main>;
}
