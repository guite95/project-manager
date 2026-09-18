"use client";

import type { InputHTMLAttributes } from "react";

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-[12px] font-medium">{label}<input {...props} className="h-9 min-w-0 rounded border border-[var(--bi-border)] bg-[var(--bi-bg)] px-3 text-[13px] outline-none focus:border-[var(--bi-accent)] disabled:opacity-50" /></label>;
}

export async function postAccess(url: string, body: unknown): Promise<{ path?: string }> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function Feedback({ error, message }: { error?: string | null; message?: string | null }) {
  return <div aria-live="polite" className="text-[12px]">{error ? <p role="alert" className="text-[var(--bi-error)]">{error}</p> : message ? <p className="text-[var(--bi-muted)]">{message}</p> : null}</div>;
}
