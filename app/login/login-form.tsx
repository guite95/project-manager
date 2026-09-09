"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(body.message ?? "로그인하지 못했습니다.");
        return;
      }
      router.replace("/today");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex w-full max-w-[320px] flex-col gap-3" onSubmit={submit}>
      <label
        className="text-[12px] font-semibold text-[var(--bi-fg)]"
        htmlFor="password"
      >
        비밀번호
      </label>
      <input
        autoComplete="current-password"
        autoFocus
        className="h-9 rounded border border-[var(--bi-border-strong)] bg-[var(--bi-bg)] px-3 text-[13px] text-[var(--bi-fg)] outline-none focus:border-[var(--bi-accent)]"
        id="password"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
      />
      <button
        className="h-9 rounded bg-[var(--bi-accent)] text-[13px] font-semibold text-white disabled:opacity-50"
        disabled={pending || !password}
        type="submit"
      >
        {pending ? "확인 중…" : "들어가기"}
      </button>
      <p aria-live="polite" className="min-h-[16px] text-[11px] text-[var(--bi-error)]">
        {error}
      </p>
    </form>
  );
}
