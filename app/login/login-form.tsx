"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/erp/button";
import { Feedback, Field, postAccess } from "@/components/access/form";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError(null);
    try {
      await postAccess("/api/login", { username, password });
      router.replace(username.trim() ? "/flows" : "/settings"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "서버에 연결하지 못했습니다."); }
    finally { setPending(false); }
  }
  return <form className="flex w-full max-w-[320px] flex-col gap-3" onSubmit={submit}>
    <Field label="아이디" autoComplete="username" autoFocus value={username} maxLength={64} onChange={event => setUsername(event.target.value)} disabled={pending} />
    <Field label="비밀번호" autoComplete="current-password" type="password" required value={password} onChange={event => setPassword(event.target.value)} disabled={pending} />
    <p className="text-[11px] text-[var(--bi-muted)]">최초 소유자 등록 전에는 아이디를 비우고 기존 공통 비밀번호로 로그인하세요.</p>
    <Button type="submit" loading={pending} disabled={!password}>로그인</Button>
    <Feedback error={error} />
  </form>;
}
