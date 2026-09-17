"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/erp/button";
import { Dropdown } from "@/components/erp/dropdown";
import { DatePicker, todayInSeoul } from "@/components/erp/date-picker";
import { parseGitHubRepositoryUrl, type GitHubConnectionStatus, type GitHubCredential, type GitHubRepositoryLink } from "@/lib/github";

const Connection = createContext<GitHubConnectionStatus | null>(null);
const inputClass = "h-[30px] min-w-0 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 text-[12px] outline-none focus:border-[var(--bi-accent)] disabled:opacity-50";
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
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const formId = useId();
  useEffect(() => {
    let active = true;
    setExpiresOn(todayInSeoul(new Date(Date.now() + 30 * 86400000)));
    api<GitHubConnectionStatus>("/api/github/status")
      .then(value => { if (active) setStatus(value); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  const register = async () => {
    setLoading(true); setError(""); setNotice("");
    const submittedToken = token;
    setToken("");
    try {
      const { credential } = await api<{credential: GitHubCredential}>("/api/github/credentials", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, token: submittedToken, expiresOn }),
      });
      setStatus(current => current ? { ...current, credentials: [...current.credentials, credential] } : current);
      setLabel(""); setNotice(`${credential.accountLogin} 계정의 토큰을 등록했습니다. 아래에서 프로젝트에 연결해 주세요.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "개인 토큰 등록에 실패했습니다."); }
    finally { setLoading(false); }
  };
  const remove = async (credential: GitHubCredential) => {
    if (!window.confirm(`${credential.label} 토큰을 앱에서 삭제할까요? 프로젝트 자료와 저장된 레포지토리 주소는 유지됩니다.`)) return;
    setLoading(true); setError(""); setNotice("");
    try {
      await api(`/api/github/credentials/${encodeURIComponent(credential.id)}`, { method: "DELETE" });
      setStatus(current => current ? { ...current, credentials: current.credentials.filter(c => c.id !== credential.id) } : current);
      setNotice("앱에서 토큰을 삭제했습니다. GitHub에서도 폐기하려면 토큰 설정에서 삭제해 주세요.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "토큰 삭제에 실패했습니다."); }
    finally { setLoading(false); }
  };
  return <Connection.Provider value={status}>
    <section aria-label="개인 프로젝트 GitHub 연결" className="mb-5 rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4">
      <h2 className="text-[13px] font-semibold">내 GitHub 계정으로 연결</h2>
      <p className="mt-1 text-[12px] text-[var(--bi-muted)]">개인 액세스 토큰으로 본인이 소유하거나 참여 중인 레포지토리를 연결합니다.</p>
      <details className="mt-3 text-[12px]">
        <summary className="cursor-pointer font-medium text-[var(--bi-accent)]">개인 토큰 발급 안내</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[var(--bi-muted)]">
          <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="text-[var(--bi-accent)] underline">Fine-grained PAT 발급</a>에서 Resource owner에 본인 계정 또는 소속 조직을 선택합니다.</li>
          <li>필요한 레포지토리만 선택하고 Metadata 읽기 권한과 만료일을 지정합니다. 조직이 승인을 요구하면 승인 후 접근할 수 있습니다.</li>
          <li>발급된 토큰을 아래에 입력합니다. 소유자가 다른 레포지토리는 토큰을 각각 등록하고 프로젝트별로 선택할 수 있습니다.</li>
        </ol>
      </details>
      {status && !status.configured && <p className="mt-3 rounded-[3px] bg-[var(--bi-bg)] p-3 text-[12px]">서버의 토큰 보안 저장소 설정이 필요합니다. 설정 후 이 화면에서 개인 토큰을 등록할 수 있습니다.</p>}
      <form autoComplete="off" className="mt-4 space-y-2" aria-label="GitHub 개인 토큰 등록" onSubmit={event => { event.preventDefault(); void register(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-[12px]">토큰 이름
            <input className={inputClass} value={label} onChange={event => setLabel(event.target.value)} maxLength={80} placeholder="예: 개인 계정 / 조직 이름" required disabled={loading || !status?.configured} />
          </label>
          <div className="text-[12px]">
            <p id={`${formId}-expiry-label`} className="mb-1">앱 사용 종료일 (최대 90일)</p>
            <DatePicker value={expiresOn} onChange={setExpiresOn} minDate={todayInSeoul()} clearable={false} ariaLabel="개인 토큰 앱 사용 종료일" disabled={loading || !status?.configured} />
          </div>
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-[12px]">개인 액세스 토큰
          <input className={inputClass} type="password" value={token} onChange={event => setToken(event.target.value)} maxLength={300}
            autoComplete="new-password" spellCheck={false} placeholder="github_pat_…" required disabled={loading || !status?.configured} />
        </label>
        <p className="text-[11px] text-[var(--bi-muted)]">토큰은 보안 저장소에 보관하며 화면에 다시 표시하지 않습니다. GitHub에서 먼저 만료되거나 취소되면 앱 사용도 중단됩니다.</p>
        <Button type="submit" loading={loading} disabled={!status?.configured || !label.trim() || !token.trim() || !expiresOn}>계정 확인 후 토큰 등록</Button>
      </form>
      {!!status?.credentials.length && <ul className="mt-4 divide-y divide-[var(--bi-border)] border-t border-[var(--bi-border)]">
        {status.credentials.map(credential => <li key={credential.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]">
          <div><span className="font-medium">{credential.label}</span> · {credential.accountLogin}
            <p className="mt-1 text-[11px] text-[var(--bi-muted)]">사용 종료: {new Date(credential.expiresAt).toLocaleDateString("ko-KR")} {credential.expiresAt <= Date.now() ? "· 만료됨" : ""}</p>
          </div>
          <Button variant="ghost" disabled={loading} onClick={() => void remove(credential)}>토큰 삭제</Button>
        </li>)}
      </ul>}
      {!status && !error && <p className="mt-2 text-[12px] text-[var(--bi-muted)]">연결 상태를 확인하고 있습니다.</p>}
      {notice && <p role="status" className="mt-2 text-[12px] text-[var(--bi-accent)]">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-[12px] text-[var(--bi-error)]">{error} {!status && <Link href="/login" className="underline">앱 로그인</Link>}</p>}
    </section>
    {children}
  </Connection.Provider>;
}

export function GitHubRepositoryForm({ projectSlug, title }: { projectSlug: string; title: string }) {
  const status = useContext(Connection);
  const inputId = useId();
  const [credentialId, setCredentialId] = useState("");
  const activeCredentials = status?.credentials.filter(c => c.expiresAt > Date.now()) ?? [];
  const selectedCredentialId = credentialId || (activeCredentials.length === 1 ? activeCredentials[0].id : "");
  const canLoad = !!status;
  const [url, setUrl] = useState("");
  const [repository, setRepository] = useState<GitHubRepositoryLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = `/api/personal-projects/${encodeURIComponent(projectSlug)}/github`;
  useEffect(() => {
    let active = true;
    if (!canLoad) return;
    api<{repository: GitHubRepositoryLink | null}>(endpoint)
      .then(data => { if (active) { setRepository(data.repository); setUrl(data.repository?.url ?? ""); setCredentialId(data.repository?.credentialId ?? ""); setLoaded(true); } })
      .catch(reason => { if (active) { setError(reason.message); setLoaded(false); } });
    return () => { active = false; };
  }, [endpoint, canLoad]);
  const save = async () => {
    setError(""); setNotice("");
    try {
      const parsed = parseGitHubRepositoryUrl(url);
      setBusy(true);
      const data = await api<{repository: GitHubRepositoryLink}>(endpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: parsed.url, credentialId: selectedCredentialId }),
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
  const connectedCredential = activeCredentials.find(c => c.id === repository?.credentialId && c.accountId === repository.accountId);
  const hasSelection = activeCredentials.some(c => c.id === selectedCredentialId);
  return <div className="mt-3 border-t border-[var(--bi-border)] pt-3">
    <form onSubmit={event => { event.preventDefault(); void save(); }} aria-label={`${title} GitHub 레포지토리 연결`}>
      <div className="mb-2">
        <p className="mb-1 text-[12px] font-medium">사용할 개인 토큰</p>
        <Dropdown value={selectedCredentialId} onChange={setCredentialId} ariaLabel={`${title}에 사용할 개인 토큰`}
          options={activeCredentials.map(c => ({value:c.id,label:`${c.label} · ${c.accountLogin}`}))}
          disabled={busy || !loaded || !activeCredentials.length} />
      </div>
      <label htmlFor={inputId} className="mb-1 block text-[12px] font-medium">GitHub 레포지토리 주소</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={inputId} type="url" value={url} onChange={event => setUrl(event.target.value)}
          autoComplete="off" spellCheck={false} maxLength={500} required disabled={busy || !loaded}
          placeholder="https://github.com/소유자/레포지토리" aria-describedby={`${inputId}-help`}
          className="h-[30px] min-w-0 flex-1 basis-[260px] rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 text-[12px] outline-none focus:border-[var(--bi-accent)] disabled:opacity-50" />
        <Button type="submit" loading={busy} disabled={!loaded || !status?.configured || !hasSelection || !url.trim()}>{repository ? "확인 후 저장" : "확인 후 연결"}</Button>
        {repository && <Button variant="ghost" disabled={busy} onClick={() => void unlink()}>연결 해제</Button>}
      </div>
      <p id={`${inputId}-help`} className="mt-1 text-[11px] text-[var(--bi-muted)]">
        {status?.configured && activeCredentials.length ? "주소를 저장할 때 GitHub 소유·참여 권한을 확인합니다." : "상단에서 사용할 개인 토큰을 먼저 등록해 주세요."}
      </p>
    </form>
    {repository && <div className="mt-2 text-[12px]">
      <a href={repository.url} target="_blank" rel="noopener noreferrer" className="text-[var(--bi-accent)] underline">{repository.fullName}</a>
      <span className="ml-2 text-[var(--bi-muted)]">{repository.private ? "비공개" : "공개"} · {connectedCredential ? "연결 저장됨" : "토큰 선택·재확인 필요"}</span>
      <p className="mt-1 text-[11px] text-[var(--bi-muted)]">최근 권한 확인: {new Date(repository.verifiedAt).toLocaleString("ko-KR")} · {repository.accountLogin}</p>
    </div>}
    {notice && <p role="status" className="mt-2 text-[12px] text-[var(--bi-accent)]">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-[12px] text-[var(--bi-error)]">{error}</p>}
  </div>;
}
