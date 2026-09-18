"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/erp/button";
import { Feedback, Field, postAccess } from "./form";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null); setMessage(null);
    if (password !== confirmation) { setError("새 비밀번호가 일치하지 않습니다."); return; }
    setPending(true);
    try {
      await postAccess("/api/account/password", { currentPassword, password });
      setCurrentPassword(""); setPassword(""); setConfirmation("");
      setMessage("비밀번호를 변경했습니다. 다른 기기의 세션은 종료되었습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "서버에 연결하지 못했습니다."); }
    finally { setPending(false); }
  }
  return <form className="flex w-full max-w-md flex-col gap-4" onSubmit={submit}>
    <Field label="현재 비밀번호" autoComplete="current-password" type="password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={pending} />
    <Field label="새 비밀번호 (12~128자)" autoComplete="new-password" type="password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} />
    <Field label="새 비밀번호 확인" autoComplete="new-password" type="password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} />
    <Button type="submit" loading={pending}>비밀번호 변경</Button>
    <Feedback error={error} message={message} />
  </form>;
}
