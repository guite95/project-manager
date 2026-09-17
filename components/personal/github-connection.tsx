"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/erp/button";
import { parseGitHubRepositoryUrl, type GitHubConnectionStatus, type GitHubRepositoryLink } from "@/lib/github";

const Connection = createContext<GitHubConnectionStatus | null>(null);
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "GitHub 연결을 처리하지 못했습니다.");
  return data;
}

export function PersonalGitHubConnection({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
  useEffect(() => {
    let active = true;
    setCallbackUrl(`${window.location.origin}/api/github/callback`);
    const result = new URLSearchParams(window.location.search).get("github");
    if (result === "connected") setNotice("GitHub 계정을 연결했습니다. 아래 프로젝트에 레포지토리 주소를 입력해 주세요.");
    if (result === "cancelled") setError("GitHub 연결을 취소했습니다.");
    if (result === "error") setError("GitHub 인증을 완료하지 못했습니다. 앱 설정을 확인하고 다시 연결해 주세요.");
    api<GitHubConnectionStatus>("/api/github/status")
      .then(value => { if (active) setStatus(value); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  const authorize = async () => {
    setLoading(true); setError("");
    try {
      const data = await api<{url: string}>("/api/github/authorize", { method: "POST" });
      window.location.assign(data.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "GitHub 연결에 실패했습니다.");
      setLoading(false);
    }
  };
  return <Connection.Provider value={status}>
    <section aria-label="개인 프로젝트 GitHub 연결" className="mb-5 rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold">GitHub 계정 연결</h2>
          <p className="mt-1 text-[12px] text-[var(--bi-muted)]">본인이 소유하거나 협업자로 참여 중인 레포지토리를 개인 프로젝트에 연결합니다.</p>
        </div>
        <Button loading={loading} disabled={!status?.configured} onClick={() => void authorize()}>
          {status?.account ? "GitHub 계정 다시 연결" : "GitHub 계정 연결"}
        </Button>
      </div>
      {status?.account && <p className="mt-3 text-[12px]">연결 계정: <span className="font-semibold">{status.account.login}</span></p>}
      {status?.installationUrl && <a href={status.installationUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12px] text-[var(--bi-accent)] underline">접근할 레포지토리 선택·앱 설치</a>}
      {status && !status.configured && <div className="mt-3 rounded-[3px] bg-[var(--bi-bg)] p-3 text-[12px]">
        <p>최초 연동 설정이 필요합니다. GitHub의 연동 프로그램을 한 번 등록하면 계정 연결 버튼을 사용할 수 있습니다.</p>
        <details className="mt-2">
          <summary className="cursor-pointer font-medium text-[var(--bi-accent)]">GitHub 연동 프로그램 설정 안내</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-[var(--bi-muted)]">
            <li><a href="https://github.com/settings/apps/new" target="_blank" rel="noopener noreferrer" className="text-[var(--bi-accent)] underline">GitHub App 등록 페이지</a>에서 연동 프로그램을 만듭니다. 모바일 앱 설치가 아닙니다.</li>
            <li>배포 앱의 Callback URL은 <code className="break-all">https://project.dev-uk.shop/api/github/callback</code>입니다. 이 기능을 배포한 뒤 사용할 수 있습니다.</li>
            {callbackUrl && callbackUrl !== "https://project.dev-uk.shop/api/github/callback" && <li>현재 환경에서 개발·검증할 때는 <code className="break-all">{callbackUrl}</code>도 별도로 등록합니다. 서버의 연동 주소도 현재 환경과 같아야 합니다.</li>}
            <li>사용자 토큰 만료를 활성화하고, 레포지토리 권한은 Metadata 읽기로 설정합니다. Webhook은 사용하지 않습니다.</li>
            <li>접근할 레포지토리에 앱을 설치합니다. 다른 소유자의 레포지토리는 소유자·조직 관리자의 설치가 필요할 수 있습니다.</li>
            <li>서버에 Client ID와 앱 이름을 설정하고, Client Secret 및 인증 토큰 저장소를 OCI Secret 서비스에 연결합니다. 비밀값은 채팅에 보내지 마세요.</li>
          </ol>
        </details>
      </div>}
      {!status && !error && <p className="mt-2 text-[12px] text-[var(--bi-muted)]">연결 상태를 확인하고 있습니다.</p>}
      {notice && <p role="status" className="mt-2 text-[12px] text-[var(--bi-accent)]">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-[12px] text-[var(--bi-error)]">{error} <Link href="/login" className="underline">앱 로그인</Link></p>}
    </section>
    {children}
  </Connection.Provider>;
}

export function GitHubRepositoryForm({ projectSlug, title }: { projectSlug: string; title: string }) {
  const status = useContext(Connection);
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [repository, setRepository] = useState<GitHubRepositoryLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = `/api/personal-projects/${encodeURIComponent(projectSlug)}/github`;
  useEffect(() => {
    let active = true;
    if (!status) return;
    api<{repository: GitHubRepositoryLink | null}>(endpoint)
      .then(data => { if (active) { setRepository(data.repository); setUrl(data.repository?.url ?? ""); setLoaded(true); } })
      .catch(reason => { if (active) { setError(reason.message); setLoaded(false); } });
    return () => { active = false; };
  }, [endpoint, status]);
  const save = async () => {
    setError(""); setNotice("");
    try {
      const parsed = parseGitHubRepositoryUrl(url);
      setBusy(true);
      const data = await api<{repository: GitHubRepositoryLink}>(endpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: parsed.url }),
      });
      setRepository(data.repository); setUrl(data.repository.url);
      setNotice("소유·참여 권한을 확인하고 연결했습니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "연결에 실패했습니다."); }
    finally { setBusy(false); }
  };
  const unlink = async () => {
    if (!window.confirm(`${title}의 GitHub 연결을 해제할까요? 프로젝트 자료와 할 일은 유지됩니다.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(endpoint, {method: "DELETE"}); setRepository(null); setUrl(""); setNotice("GitHub 연결을 해제했습니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "연결 해제에 실패했습니다."); }
    finally { setBusy(false); }
  };
  const sameAccount = repository && repository.accountId === status?.account?.id;
  return <div className="mt-3 border-t border-[var(--bi-border)] pt-3">
    <form onSubmit={event => { event.preventDefault(); void save(); }} aria-label={`${title} GitHub 레포지토리 연결`}>
      <label htmlFor={inputId} className="mb-1 block text-[12px] font-medium">GitHub 레포지토리 주소</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={inputId} type="url" value={url} onChange={event => setUrl(event.target.value)}
          autoComplete="off" spellCheck={false} maxLength={500} required disabled={busy || !loaded}
          placeholder="https://github.com/소유자/레포지토리" aria-describedby={`${inputId}-help`}
          className="h-[30px] min-w-0 flex-1 basis-[260px] rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 text-[12px] outline-none focus:border-[var(--bi-accent)] disabled:opacity-50" />
        <Button type="submit" loading={busy} disabled={!loaded || !status?.configured || !status.account || !url.trim()}>{repository ? "확인 후 저장" : "확인 후 연결"}</Button>
        {repository && <Button variant="ghost" disabled={busy} onClick={() => void unlink()}>연결 해제</Button>}
      </div>
      <p id={`${inputId}-help`} className="mt-1 text-[11px] text-[var(--bi-muted)]">
        {status?.configured && status.account ? "주소를 저장할 때 GitHub 소유·참여 권한을 확인합니다." : "상단에서 GitHub 계정 연결을 먼저 완료해 주세요."}
      </p>
    </form>
    {repository && <div className="mt-2 text-[12px]">
      <a href={repository.url} target="_blank" rel="noopener noreferrer" className="text-[var(--bi-accent)] underline">{repository.fullName}</a>
      <span className="ml-2 text-[var(--bi-muted)]">{repository.private ? "비공개" : "공개"} · {sameAccount ? "연결 저장됨" : "계정 확인 필요"}</span>
      <p className="mt-1 text-[11px] text-[var(--bi-muted)]">최근 권한 확인: {new Date(repository.verifiedAt).toLocaleString("ko-KR")} · {repository.accountLogin}</p>
    </div>}
    {notice && <p role="status" className="mt-2 text-[12px] text-[var(--bi-accent)]">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-[12px] text-[var(--bi-error)]">{error}</p>}
  </div>;
}
