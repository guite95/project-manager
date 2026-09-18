"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/erp/button";
import { Dropdown } from "@/components/erp/dropdown";
import { Feedback, Field, postAccess } from "./form";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type Membership = { projectSlug: string; role: "VIEWER" | "EDITOR" };
type User = { id: string; username: string; name: string; role: Role; active: boolean; memberships: Membership[] };
type Project = { slug: string; title: string; charts: { slug: string; title: string }[] };
type AccessData = {
  actor: { id: string; username: string; name: string; role: Role; bootstrap: boolean };
  users: User[]; projects: Project[];
  shares: { id: string; projectSlug: string; chartSlug: string; expiresAt: string }[];
};
const roleLabels = { OWNER: "소유자", ADMIN: "관리자", MEMBER: "멤버" };
const memberOptions = [{ value: "MEMBER", label: "멤버" }];
const ownerOptions = [...memberOptions, { value: "ADMIN", label: "관리자" }];
const permissionOptions = [{ value: "", label: "접근 불가" }, { value: "VIEWER", label: "열람" }, { value: "EDITOR", label: "편집" }];
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded border border-[var(--bi-border)] p-5"><h2 className="text-[14px] font-semibold">{title}</h2>{children}</section>;
}
function expiry(value: string) { return new Date(value).toLocaleString("ko-KR"); }

function UserEditor({ user, data, pending, save }: { user: User; data: AccessData; pending: boolean; save: (body: unknown) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active);
  const [memberships, setMemberships] = useState(user.memberships);
  const editable = user.id !== data.actor.id && user.role !== "OWNER" && (data.actor.role === "OWNER" || user.role !== "ADMIN");
  const canChangeRole = data.actor.role === "OWNER";
  const editorId = `permissions-${user.id}`;
  const permissionSummary = user.role === "OWNER" ? "전체 프로젝트 권한" : user.role === "ADMIN" ? "회사 프로젝트 전체 관리" : user.memberships.length ? user.memberships.map(item => `${data.projects.find(project => project.slug === item.projectSlug)?.title ?? item.projectSlug}: ${item.role === "EDITOR" ? "편집" : "열람"}`).join(" · ") : "접근 가능한 프로젝트 없음";
  function startEditing() {
    setRole(user.role); setActive(user.active); setMemberships(user.memberships); setEditing(true);
  }
  return <article className="rounded border border-[var(--bi-border)] px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-[13px]">{user.name || user.username} <span className="text-[var(--bi-muted)]">@{user.username} · {roleLabels[user.role]} · {user.active ? "활성" : "비활성"}{user.id === data.actor.id ? " · 나" : ""}</span></p>
        <p className="text-[12px] text-[var(--bi-muted)]">{permissionSummary}</p>
      </div>
      {editable && <Button variant="secondary" size="sm" disabled={pending || editing} aria-label={`${user.username} 권한 편집`} aria-expanded={editing} aria-controls={editorId} onClick={startEditing}>권한 편집</Button>}
    </div>
    {editable && <div id={editorId} hidden={!editing}>{editing && <form className="mt-4 space-y-4" onSubmit={async event => { event.preventDefault(); if (await save({ action: "updateUser", id: user.id, role, active, memberships })) setEditing(false); }}>
      <div className="flex flex-wrap items-center gap-4">
        {canChangeRole ? <Dropdown ariaLabel={`${user.username} 계정 역할`} value={role} onChange={value => setRole(value as Role)} options={ownerOptions} disabled={pending} className="w-40" /> : <span className="text-[12px]">계정 역할: {roleLabels[role]}</span>}
        <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={active} disabled={pending} onChange={event => setActive(event.target.checked)} />활성 계정</label>
      </div>
      <p className="text-[12px] text-[var(--bi-muted)]">{role === "ADMIN" ? "관리자는 회사 프로젝트 전체를 관리합니다." : "프로젝트별로 접근 불가, 열람, 편집 권한을 지정하세요."} 변경을 저장하면 이 사용자의 기존 세션이 종료되며, 다시 로그인할 때 변경된 권한이 적용됩니다.</p>
      {role === "MEMBER" && <div className="grid gap-3 sm:grid-cols-2">{data.projects.map(project => <div key={project.slug} className="space-y-1"><span className="text-[12px]">{project.title}</span><Dropdown ariaLabel={`${user.username} ${project.title} 권한`} value={memberships.find(item => item.projectSlug === project.slug)?.role ?? ""} options={permissionOptions} disabled={pending} onChange={value => setMemberships(current => [...current.filter(item => item.projectSlug !== project.slug), ...(value ? [{ projectSlug: project.slug, role: value as Membership["role"] }] : [])])} /></div>)}</div>}
      <div className="flex gap-2"><Button type="submit" loading={pending}>권한 저장</Button><Button variant="secondary" disabled={pending} onClick={() => setEditing(false)}>취소</Button></div>
    </form>}</div>}
    {!editable && <p className="mt-3 text-[12px] text-[var(--bi-muted)]">{user.role === "OWNER" ? "소유자는 항상 전체 권한을 유지합니다." : user.id === data.actor.id ? "자신의 권한은 변경할 수 없습니다." : "관리자 계정의 권한은 소유자만 변경할 수 있습니다."}</p>}
  </article>;
}

export function AccessManager() {
  const router = useRouter();
  const [data, setData] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<{ label: string; url: string } | null>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [projectSlug, setProjectSlug] = useState("");
  const [chartSlug, setChartSlug] = useState("");
  const [days, setDays] = useState("7");
  const load = useCallback(async () => {
    const response = await fetch("/api/access", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message ?? "계정 관리 정보를 불러오지 못했습니다.");
    setData(body as AccessData);
  }, []);
  useEffect(() => { let disposed = false;
    async function initialLoad() {
      try { await load(); } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : "서버에 연결하지 못했습니다."); }
      finally { if (!disposed) setLoading(false); }
    }
    void initialLoad(); return () => { disposed = true; };
  }, [load]);
  async function save(body: unknown): Promise<boolean> {
    if (pending) return false;
    setPending(true); setError(null); setMessage(null);
    try {
      const result = await postAccess("/api/access", body);
      if (result.path) setCreatedLink({ label: "읽기 전용 공유 링크", url: new URL(result.path, window.location.origin).href });
      else setCreatedLink(null);
      setMessage("저장했습니다.");
      try { await load(); router.refresh(); }
      catch { setError("저장은 완료했으나 목록을 갱신하지 못했습니다. 새로고침하세요."); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "서버에 연결하지 못했습니다."); return false; }
    finally { setPending(false); }
  }
  async function copyLink() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink.url);
      setError(null); setMessage("링크를 복사했습니다.");
    } catch { setError("자동 복사하지 못했습니다. 링크를 선택해 직접 복사하세요."); }
  }
  async function submitIdentity(event: FormEvent) {
    event.preventDefault();
    const success = await save(data?.actor.bootstrap ? { action: "bootstrap", username, name, password } : { action: "createUser", username, name, role, password });
    if (success) { setUsername(""); setName(""); setPassword(""); if (!data?.actor.bootstrap) setMessage("계정을 생성했습니다. 입력한 아이디와 초기 비밀번호를 전달하고, 아래에서 프로젝트 권한을 지정하세요."); }
  }
  const identityForm = <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitIdentity}>
    <Field label="아이디" autoComplete="off" required pattern="[a-z0-9._-]{3,64}" minLength={3} maxLength={64} title="영문 소문자, 숫자, 점, 밑줄, 대시 3~64자" value={username} onChange={event => setUsername(event.target.value)} disabled={pending} />
    <Field label="이름" required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={pending} />
    <Field label={data?.actor.bootstrap ? "비밀번호 (12~128자)" : "초기 비밀번호 (12~128자)"} required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} />
    {!data?.actor.bootstrap && <Dropdown ariaLabel="발급 계정 역할" value={role} options={data?.actor.role === "OWNER" ? ownerOptions : memberOptions} onChange={setRole} disabled={pending} />}
    <div className="flex items-end"><Button type="submit" loading={pending}>{data?.actor.bootstrap ? "소유자 계정 등록" : "계정 생성"}</Button></div>
  </form>;
  if (loading) return <p role="status" className="text-[13px] text-[var(--bi-muted)]">계정 정보를 불러오는 중…</p>;
  if (!data) return <div className="space-y-4"><Feedback error={error} /><Button onClick={() => { setLoading(true); setError(null); void load().catch(cause => setError(cause instanceof Error ? cause.message : "다시 시도하세요.")).finally(() => setLoading(false)); }}>다시 시도</Button><Link href="/account" className="ml-4 text-[12px] text-[var(--bi-accent)]">내 비밀번호 변경</Link></div>;
  const selectedProject = data.projects.find(project => project.slug === projectSlug);
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between gap-3 text-[13px]"><p>{data.actor.name || data.actor.username || "최초 등록"} · {roleLabels[data.actor.role]}</p>{!data.actor.bootstrap && <Link href="/account" className="text-[var(--bi-accent)]">내 비밀번호 변경</Link>}</div>
    <Feedback error={error} message={message} />
    {createdLink && <div className="space-y-2 rounded border border-[var(--bi-accent)] p-4"><p className="text-[13px] font-semibold">{createdLink.label}</p><p className="text-[12px] text-[var(--bi-muted)]">이 링크는 생성 직후에만 표시됩니다. 복사하여 직접 전달하세요.</p><input aria-label={createdLink.label} className="w-full rounded border border-[var(--bi-border)] bg-[var(--bi-bg)] p-2 text-[12px]" readOnly value={createdLink.url} onFocus={event => event.target.select()} /><Button variant="secondary" onClick={() => { void copyLink(); }}>링크 복사</Button></div>}
    {data.actor.bootstrap ? <Section title="최초 소유자 등록"><p className="text-[12px] text-[var(--bi-muted)]">소유자 등록 후 기존 공통 비밀번호 로그인은 종료됩니다.</p>{identityForm}</Section> : <>
      <Section title="계정 발급"><p className="text-[12px] text-[var(--bi-muted)]">아이디와 초기 비밀번호를 정해 계정을 바로 생성합니다. 생성 후 아래에서 프로젝트 권한을 지정하고 로그인 정보를 전달하세요. 사용자는 내 계정에서 비밀번호를 변경할 수 있습니다.</p>{identityForm}</Section>
      <Section title="계정 및 프로젝트 권한"><p className="text-[12px] text-[var(--bi-muted)]">계정별 권한 편집 버튼으로 역할, 활성 상태와 프로젝트 권한을 언제든지 변경할 수 있습니다.</p>{data.users.length ? data.users.map(user => <UserEditor key={`${user.id}:${JSON.stringify(user)}`} user={user} data={data} pending={pending} save={save} />) : <p className="text-[12px] text-[var(--bi-muted)]">등록된 계정이 없습니다.</p>}</Section>
      <Section title="문서 읽기 전용 공유"><p className="text-[12px] text-[var(--bi-muted)]">링크를 가진 사람은 로그인 없이 선택한 회사 문서를 열람할 수 있습니다. 개인 프로젝트와 TNS ERD는 공유할 수 없습니다.</p>
        <form className="grid items-end gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void save({ action: "share", projectSlug, chartSlug, days: Number(days) }); }}>
          <Dropdown ariaLabel="공유 프로젝트" value={projectSlug} options={data.projects.map(project => ({ value: project.slug, label: project.title }))} onChange={value => { setProjectSlug(value); setChartSlug(""); }} disabled={pending} />
          <Dropdown ariaLabel="공유 문서" value={chartSlug} options={(selectedProject?.charts ?? []).map(chart => ({ value: chart.slug, label: chart.title }))} onChange={setChartSlug} disabled={pending || !projectSlug} />
          <Field label="공유 기간 (1~90일)" type="number" required min={1} max={90} step={1} value={days} onChange={event => setDays(event.target.value)} disabled={pending} />
          <Button type="submit" disabled={pending || !projectSlug || !chartSlug}>공유 링크 생성</Button>
        </form>
        {data.shares.length ? data.shares.map(share => <div key={share.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bi-border)] pt-3 text-[12px]"><p>{data.projects.find(project => project.slug === share.projectSlug)?.title ?? share.projectSlug} / {data.projects.find(project => project.slug === share.projectSlug)?.charts.find(chart => chart.slug === share.chartSlug)?.title ?? share.chartSlug}<span className="block text-[var(--bi-muted)]">만료: {expiry(share.expiresAt)}</span></p><Button variant="destructive" disabled={pending} onClick={() => { void save({ action: "revokeShare", id: share.id }); }}>공유 회수</Button></div>) : <p className="text-[12px] text-[var(--bi-muted)]">발급한 공유 링크가 없습니다.</p>}
      </Section>
    </>}
  </div>;
}
