"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/erp/button";
import { Dropdown } from "@/components/erp/dropdown";
import { DateRangeFilter } from "@/components/erp/date-picker";
import { PageHeader } from "@/components/erp/page-header";
import type { AiFilters, AiOverview, AiSearchResult, AiSessionDetail, AiTokens } from "@/lib/ai-ops/contracts";

const panel = "rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4";
const muted = "text-[var(--bi-muted)]";
const number = (value: number | null) => value === null ? "미제공" : value.toLocaleString("ko-KR");
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
const sourceName = (source: string) => source === "CLAUDE_CODE" ? "Claude Code" : "Codex";
const tokenFields = [
  ["inputTokens", "입력"], ["cacheReadTokens", "캐시 읽기"], ["cacheWriteTokens", "캐시 쓰기"],
  ["outputTokens", "출력"], ["reasoningTokens", "추론"], ["totalTokens", "전체"],
] as const;

function params(filters: AiFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}
function readFilters(search: URLSearchParams): AiFilters {
  const source = search.get("source");
  const defaultRange = !search.has("from") && !search.has("to") && search.get("range") !== "all";
  const now = new Date();
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const weekStart = new Date(now.getTime() - 6 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  return { from: defaultRange ? weekStart : search.get("from") ?? "", to: defaultRange ? today : search.get("to") ?? "", device: search.get("device") ?? "", model: search.get("model") ?? "", source: source === "CODEX" || source === "CLAUDE_CODE" ? source : "" };
}

function useRequest<T>(url: string | null, revision: number, body?: string, poll = false) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null; updated: string | null }>({ data: null, loading: true, error: null, updated: null });
  useEffect(() => {
    if (!url) { setState({ data: null, loading: false, error: null, updated: null }); return; }
    let disposed = false;
    let controller: AbortController | undefined;
    let busy = false;
    let authExpired = false;
    setState({ data: null, loading: true, error: null, updated: null });
    const load = async () => {
      if (busy || authExpired) return;
      busy = true;
      controller = new AbortController();
      setState(previous => ({ ...previous, loading: true }));
      try {
        const response = await fetch(url, { method: body ? "POST" : "GET", body, headers: body ? { "Content-Type": "application/json" } : undefined, signal: controller.signal, cache: "no-store" });
        if (response.status === 401) {
          authExpired = true;
          if (!disposed) setState({ data: null, loading: false, error: "로그인이 만료되었습니다. 다시 로그인해 주세요.", updated: null });
          return;
        }
        const result = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "로그인이 만료되었습니다. 다시 로그인해 주세요." : result.error?.message ?? result.error ?? "AI 데이터를 불러오지 못했습니다.");
        if (!disposed) setState({ data: result as T, loading: false, error: null, updated: new Date().toISOString() });
      } catch (error) {
        if (!disposed && !controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : "연결을 확인하고 다시 시도해 주세요." }));
      } finally { busy = false; }
    };
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = poll ? window.setInterval(refresh, 15_000) : undefined;
    if (poll) { window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh); }
    return () => { disposed = true; controller?.abort(); if (timer) window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [url, body, revision, poll]);
  return state;
}

function Pagination({ next, pages, onChange, loading }: { next: string | null; pages: string[]; onChange: (pages: string[]) => void; loading: boolean }) {
  return <div className="mt-3 flex items-center justify-between gap-2">
    <Button variant="secondary" disabled={!pages.length || loading} onClick={() => onChange(pages.slice(0, -1))}>이전</Button>
    <span className={muted}>{pages.length + 1}페이지</span>
    <Button variant="secondary" disabled={!next || loading} onClick={() => { if (next) onChange([...pages, next]); }}>다음</Button>
  </div>;
}

function TokenCards({ tokens }: { tokens: AiTokens }) {
  const segments = tokenFields.filter(([key]) => key !== "totalTokens");
  const knownTotal = segments.reduce((sum, [key]) => sum + (tokens[key] ?? 0), 0);
  const colors = ["#0284c7", "#6366f1", "#d97706", "#059669", "#9333ea"];
  return <div>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {tokenFields.map(([key, label]) => <div className={panel} key={key}><dt className={muted}>{label} 토큰</dt><dd className="mt-2 text-lg font-semibold tabular-nums">{number(tokens[key])}</dd></div>)}
    </dl>
    <div className={`${panel} mt-3`}>
      <h2 className="text-sm font-semibold">토큰 구성</h2>
      {knownTotal > 0 ? <div role="img" aria-label={`제공된 토큰 구성: ${segments.map(([key, label]) => `${label} ${number(tokens[key])}`).join(", ")}`} className="mt-3 flex h-4 overflow-hidden rounded">{segments.map(([key, label], index) => <span key={key} title={`${label}: ${number(tokens[key])}`} style={{ width: `${100 * (tokens[key] ?? 0) / knownTotal}%`, backgroundColor: colors[index] }} />)}</div> : <p className={`mt-3 text-xs ${muted}`}>표시할 토큰 구성이 없습니다.</p>}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">{segments.map(([key, label], index) => <li key={key} className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: colors[index] }} />{label} {number(tokens[key])}</li>)}</ul>
    </div>
    <p className={`mt-2 text-xs ${muted}`}>입력·출력은 캐시·추론과 겹치지 않도록 구분합니다. 미제공은 0과 다르며, 미제공이 있으면 구성 합계와 전체가 다를 수 있습니다. 막대 비율은 제공된 구성 항목 기준입니다. 사용량 기록 {number(tokens.records)}개 중 일부 항목 미제공 {number(tokens.missingRecords)}개.</p>
  </div>;
}

function UsageTable({ title, rows }: { title: string; rows: (AiTokens & { label: string })[] }) {
  const max = Math.max(1, ...rows.map(row => row.totalTokens ?? 0));
  return <section className={panel} aria-label={title}>
    <h2 className="text-sm font-semibold">{title}</h2>
    {!rows.length ? <p className={`mt-4 ${muted}`}>선택한 조건의 사용량 기록이 없습니다.</p> : <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs"><caption className="sr-only">{title}. 막대 길이는 전체 토큰에 비례합니다. 값이 없는 항목은 미제공으로 표시합니다.</caption>
        <thead><tr className="border-b border-[var(--bi-border)]"><th scope="col" className="p-2">구분</th>{tokenFields.map(([key, label]) => <th scope="col" className="p-2 text-right" key={key}>{label}</th>)}<th scope="col" className="p-2 text-right">기록 / 일부 미제공</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className="border-b border-[var(--bi-border)] last:border-0"><th scope="row" className="max-w-56 break-words p-2 font-normal"><span>{row.label}</span><div aria-hidden className="mt-1 h-1 rounded bg-[var(--bi-sidebar-bg)]"><div className="h-1 rounded bg-[var(--bi-accent)]" style={{ width: `${100 * (row.totalTokens ?? 0) / max}%` }} /></div></th>{tokenFields.map(([key]) => <td className="p-2 text-right tabular-nums" key={key}>{number(row[key])}</td>)}<td className="p-2 text-right tabular-nums">{number(row.records)} / {number(row.missingRecords)}</td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

export function AiOpsDashboard({ view }: { view: "activity" | "usage" }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [filters, setFilters] = useState<AiFilters>(() => readFilters(new URLSearchParams(searchParams.toString())));
  const [pages, setPages] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(searchParams.get("session"));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [messagePages, setMessagePages] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [searchBody, setSearchBody] = useState<string | undefined>();
  const [searchPages, setSearchPages] = useState<string[]>([]);
  const [searchRevision, setSearchRevision] = useState(0);
  const [searchValidation, setSearchValidation] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const scrolledAnchor = useRef<string | null>(null);
  const filterQuery = params(filters);
  const overview = useRequest<AiOverview>(`/api/ai-ops/overview?${params({ ...filters, cursor: pages.at(-1), limit: 25 })}`, revision, undefined, true);
  const detail = useRequest<AiSessionDetail>(selected ? `/api/ai-ops/sessions/${encodeURIComponent(selected)}?${params({ cursor: messagePages.at(-1), limit: 30 })}${anchor ? `&messageId=${encodeURIComponent(anchor)}` : ""}` : null, revision, undefined, true);
  const searchPayload = useMemo(() => searchBody ? JSON.stringify({ ...JSON.parse(searchBody), cursor: searchPages.at(-1), limit: 20 }) : undefined, [searchBody, searchPages]);
  const search = useRequest<AiSearchResult>(searchPayload ? "/api/ai-ops/search" : null, revision + searchRevision, searchPayload);
  const changeFilter = useCallback((key: keyof AiFilters, value: string) => {
    setFilters(previous => ({ ...previous, [key]: value })); setPages([]); setSearchBody(undefined); setSearchPages([]); setSearchValidation(null); setSelected(null); setAnchor(null); setMessagePages([]);
  }, []);
  useEffect(() => {
    const url = new URLSearchParams(filterQuery);
    if (!url.has("from") && !url.has("to")) url.set("range", "all");
    if (selected) url.set("session", selected);
    window.history.replaceState(null, "", `${pathname}${url.size ? `?${url}` : ""}`);
  }, [filterQuery, pathname, selected]);
  useEffect(() => {
    const back = () => { const url = new URLSearchParams(window.location.search); setFilters(readFilters(url)); setSelected(url.get("session")); setPages([]); setMessagePages([]); setAnchor(null); setSearchBody(undefined); };
    window.addEventListener("popstate", back); return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    if (!detail.data || !anchor || scrolledAnchor.current === anchor) return;
    const target = document.getElementById(`message-${anchor}`);
    if (target) { target.scrollIntoView({ block: "center" }); scrolledAnchor.current = anchor; }
  }, [detail.data, anchor]);
  const selectSession = (id: string, messageId?: string) => { scrolledAnchor.current = null; setSelected(id); setAnchor(messageId ?? null); setMessagePages([]); requestAnimationFrame(() => detailRef.current?.focus()); };
  const runSearch = () => {
    if (!query.trim()) { setSearchValidation("검색할 내용을 입력해 주세요."); return; }
    const now = new Date();
    const today = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const earliest = new Date(now.getTime() - 89 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const from = filters.from && filters.from > earliest ? filters.from : earliest;
    const to = filters.to && filters.to < today ? filters.to : today;
    if (from > to) { setSearchValidation("본문 검색은 최근 90일 이내 기간에서 가능합니다."); return; }
    setSearchValidation(null); setSearchPages([]); setSearchRevision(value => value + 1); setSearchBody(JSON.stringify({ ...filters, from, to, query: query.trim(), ...(kind ? { kind } : {}) }));
  };
  const data = overview.data;
  return <div className="mx-auto max-w-[1600px]">
    <PageHeader title={view === "activity" ? "AI 활동 및 대화" : "AI 사용량 통계"} description="기기별 Codex·Claude Code 사용 기록 · 한국 시간 기준" />
    <div className="space-y-5 p-4 text-[13px] md:p-6">
      <div className="flex flex-wrap items-center gap-2" aria-label="AI 기록 필터">
        <DateRangeFilter from={filters.from ?? ""} to={filters.to ?? ""} onFromChange={value => changeFilter("from", value)} onToChange={value => changeFilter("to", value)} quickToggle />
        <Dropdown className="w-40" ariaLabel="기기 필터" value={filters.device ?? ""} onChange={value => changeFilter("device", value)} options={[{ value: "", label: "모든 기기" }, ...(data?.devices ?? []).map(device => ({ value: device.id, label: device.name }))]} />
        <Dropdown className="w-36" ariaLabel="원천 필터" value={filters.source ?? ""} onChange={value => changeFilter("source", value)} options={[{ value: "", label: "모든 원천" }, { value: "CODEX", label: "Codex" }, { value: "CLAUDE_CODE", label: "Claude Code" }]} />
        <Dropdown className="w-44" ariaLabel="모델 필터" value={filters.model ?? ""} onChange={value => changeFilter("model", value)} options={[{ value: "", label: "모든 모델" }, ...(data?.options.models ?? []).map(model => ({ value: model, label: model }))]} />
        <Button variant="secondary" onClick={() => setRevision(value => value + 1)} disabled={overview.loading}>새로고침</Button>
      </div>
      <p className={`text-xs ${muted}`} role="status">{overview.loading ? "AI 기록을 불러오는 중…" : overview.updated ? `조회 ${date(overview.updated)} · 화면이 보이는 동안 15초마다 갱신` : "기록 조회 대기"}</p>
      {overview.error ? <div role="alert" className={`${panel} text-[var(--bi-error)]`}>{overview.error}<p className="mt-2">수집 준비 및 연결 상태를 확인한 뒤 새로고침해 주세요.</p></div> : null}
      {data ? <>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["세션", data.summary.sessions], ["프롬프트", data.summary.prompts], ["응답", data.summary.responses], ["전체 메시지", data.summary.messages]].map(([label, count]) => <div className={panel} key={label}><dt className={muted}>{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{number(count as number)}</dd></div>)}
        </dl>
        <TokenCards tokens={data.summary} />
        <p className={`text-xs ${muted}`}>프롬프트 {number(data.summary.promptChars)}자 · 응답 {number(data.summary.responseChars)}자</p>
        {view === "usage" ? <>
          <UsageTable title="모델별 토큰 사용량" rows={data.byModel.map(row => ({ ...row, label: row.model ?? "모델 미제공" }))} />
          <UsageTable title="날짜별 토큰 사용량" rows={data.byDay.map(row => ({ ...row, label: row.day }))} />
        </> : <>
          <section className={panel} aria-label="대화 본문 검색">
            <h2 className="font-semibold">프롬프트·응답 검색</h2>
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); runSearch(); }}>
              <label className="min-w-40 flex-1"><span className="sr-only">검색어</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} placeholder="대화 내용 검색" className="h-[30px] w-full rounded border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 outline-[var(--bi-accent)]" /></label>
              <Dropdown className="w-36" ariaLabel="본문 검색 대상" value={kind} onChange={setKind} options={[{ value: "", label: "프롬프트 및 응답" }, { value: "USER", label: "프롬프트" }, { value: "ASSISTANT", label: "응답" }]} />
              <Button type="submit" disabled={search.loading}>검색</Button>
              {searchBody ? <Button variant="ghost" onClick={() => { setSearchBody(undefined); setSearchPages([]); }}>검색 닫기</Button> : null}
            </form>
            <p className={`mt-2 text-xs ${muted}`}>선택한 필터를 적용하며 본문은 최근 90일 안에서 검색합니다. 검색어는 URL에 저장하지 않습니다.</p>
            {searchValidation || search.error ? <p role="alert" className="mt-3 text-[var(--bi-error)]">{searchValidation ?? search.error}</p> : null}
            {search.loading ? <p role="status" className="mt-3">본문을 검색하는 중…</p> : null}
            {search.data ? <div className="mt-4">
              {!search.data.messages.length ? <p className={muted}>일치하는 대화가 없습니다.</p> : <ul className="divide-y divide-[var(--bi-border)]">{search.data.messages.map(message => <li key={message.id} className="py-3"><button type="button" className="w-full rounded text-left focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]" onClick={() => selectSession(message.sessionId, message.id)}><span className="font-semibold text-[var(--bi-accent)]">{message.title || "제목 없는 세션"}</span><span className={`mt-1 block text-xs ${muted}`}>{message.role === "USER" ? "프롬프트" : "응답"} · {sourceName(message.source)} · {message.deviceName} · {date(message.occurredAt)}</span><span className="mt-2 block line-clamp-3 whitespace-pre-wrap break-words">{message.body ?? "본문 보관 기간 만료"}</span></button></li>)}</ul>}
              <Pagination pages={searchPages} next={search.data.nextCursor} onChange={setSearchPages} loading={search.loading} />
            </div> : null}
          </section>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
            <section className={panel}><h2 className="font-semibold">최근 활동 세션</h2>
              {!data.sessions.length ? <p className={`mt-4 ${muted}`}>선택한 조건의 세션이 없습니다. 기기의 마지막 업로드 상태를 확인해 주세요.</p> : <ul className="mt-3 divide-y divide-[var(--bi-border)]">{data.sessions.map(session => <li key={session.id}><button type="button" aria-pressed={selected === session.id} onClick={() => selectSession(session.id)} className={`w-full rounded p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)] ${selected === session.id ? "bg-[var(--bi-accent-light)]" : "hover:bg-[var(--bi-sidebar-bg)]"}`}><span className="block break-words font-semibold">{session.title || "제목 없는 세션"}</span><span className={`mt-1 block text-xs ${muted}`}>{sourceName(session.source)} · {session.deviceName} · {date(session.lastActiveAt)}</span><span className={`mt-1 block truncate text-xs ${muted}`} title={session.cwd}>{session.cwd}</span></button></li>)}</ul>}
              <Pagination pages={pages} next={data.nextCursor} onChange={setPages} loading={overview.loading} />
            </section>
            <section ref={detailRef} tabIndex={-1} aria-label="선택한 세션 대화" className={`${panel} min-w-0 outline-[var(--bi-accent)]`}>
              <h2 className="font-semibold">대화 상세</h2>
              {!selected ? <p className={`mt-4 ${muted}`}>세션을 선택하면 공개 프롬프트와 응답을 시간순으로 확인할 수 있습니다.</p> : <>
                {detail.loading ? <p role="status" className="mt-3">대화를 불러오는 중…</p> : null}
                {detail.error ? <p role="alert" className="mt-3 text-[var(--bi-error)]">{detail.error}</p> : null}
                {detail.data ? <>
                  <p className="mt-3 break-words font-semibold">{detail.data.session.title || "제목 없는 세션"}</p>
                  <p className={`mt-1 break-all text-xs ${muted}`}>{detail.data.session.cwd} · {sourceName(detail.data.session.source)} · {detail.data.session.deviceName}</p>
                  <p className={`mt-2 text-xs ${muted}`}>본문 보관 90일 · 메타데이터 및 사용량 보관 365일</p>
                  {anchor ? <Button variant="ghost" className="mt-2" onClick={() => { setAnchor(null); setMessagePages([]); }}>검색 위치에서 세션 처음으로 이동</Button> : null}
                  {!detail.data.messages.length ? <p className={`mt-4 ${muted}`}>이 세션에 수집된 공개 대화가 없습니다.</p> : <ol className="mt-4 space-y-4">{detail.data.messages.map(message => <li id={`message-${message.id}`} key={message.id} className={`rounded border p-3 ${message.id === anchor ? "border-[var(--bi-accent)]" : "border-[var(--bi-border)]"}`}><div className="flex flex-wrap items-center gap-2"><strong>{message.role === "USER" ? "프롬프트" : "응답"}</strong><time dateTime={message.occurredAt} className={`text-xs ${muted}`}>{date(message.occurredAt)}</time><span className={`text-xs ${muted}`}>{message.model ?? "모델 미제공"}</span></div><p className={`mt-3 whitespace-pre-wrap break-words leading-6 [overflow-wrap:anywhere] ${message.body === null ? muted : ""}`}>{message.body ?? "보관 기간이 지나 본문이 삭제되었습니다."}</p></li>)}</ol>}
                  <Pagination pages={messagePages} next={detail.data.nextCursor} onChange={setMessagePages} loading={detail.loading} />
                </> : null}
              </>}
            </section>
          </div>
        </>}
        <section className={panel} aria-label="기기 동기화 상태"><h2 className="font-semibold">기기 동기화 상태</h2>
          {!data.devices.length ? <p className={`mt-3 ${muted}`}>연결된 기기가 없습니다. 수집 Agent가 첫 업로드를 완료하면 표시됩니다.</p> : <ul className="mt-3 grid gap-3 md:grid-cols-2">{data.devices.map(device => <li key={device.id} className="rounded border border-[var(--bi-border)] p-3"><strong>{device.name}</strong><p className={`mt-1 text-xs ${muted}`}>마지막 업로드 {date(device.lastSyncAt)}{Date.now() - new Date(device.lastSyncAt).getTime() > 5 * 60_000 ? " · 업로드 지연" : ""}</p><p className="mt-2">탐색 루트 {number(device.rootCount)}개 · 파일 {number(device.files)}개 · <span className={device.errors ? "text-[var(--bi-error)]" : muted}>오류 {number(device.errors)}개</span></p>{device.errors ? <p className="mt-1 text-xs text-[var(--bi-error)]">기기의 수집 상태 및 로그 접근 권한을 확인해 주세요.</p> : null}</li>)}</ul>}
        </section>
      </> : null}
    </div>
  </div>;
}
