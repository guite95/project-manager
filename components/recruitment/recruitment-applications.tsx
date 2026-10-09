'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, type BadgeVariant } from '@/components/erp/badge';
import { Button } from '@/components/erp/button';
import { buttonClassName } from '@/components/erp/button-styles';
import { useConfirm } from '@/components/erp/confirm-dialog';
import { DataTable } from '@/components/erp/data-table';
import { Dropdown } from '@/components/erp/dropdown';
import { CheckboxField, DateField, SelectField, TextField } from '@/components/erp/form-field';
import { FormGrid } from '@/components/erp/form-layout';
import { ListToolbar } from '@/components/erp/list-toolbar';
import { LoadingIndicator } from '@/components/erp/loading-indicator';
import { FormModal } from '@/components/erp/zespro';
import {
  applicationInputSchema, applicationPriorities, applicationStatuses, applicationTaskSchema, emptyApplication,
  type ApplicationDetail, type ApplicationHistoryEntry, type ApplicationSummary, type ApplicationTask, type ApplicationTaskInput,
} from '@/lib/recruitment-applications';
import { jobStatuses, type JobDetail } from '@/lib/recruitment-jobs';
import { ApplicationEditor, applicationResponse, documentHref } from './application-editor';
import { draftFromApplication, inputFromDraft, type ApplicationDraft } from './application-draft';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
const date = (value: string | null) => value ? dateFormat.format(new Date(value)) : '미확인';
const statusTone = (status: ApplicationSummary['status']): BadgeVariant => status === 'OFFER' ? 'success' : status === 'REJECTED' ? 'error' : ['EXCLUDED', 'WITHDRAWN'].includes(status) ? 'neutral' : status === 'INTERVIEW' ? 'warning' : 'primary';
const documentLabels = { EXPERIENCE: '경험', COVER_LETTER: '자기소개서', PORTFOLIO: '포트폴리오' };
type RequestToken = { payload: string; id: string };
function requestId(ref: { current: RequestToken | null }, payload: unknown) {
  const serialized = JSON.stringify(payload);
  if (ref.current?.payload !== serialized) ref.current = { payload: serialized, id: crypto.randomUUID() };
  return ref.current.id;
}

export function RecruitmentApplications() {
  const { confirm } = useConfirm();
  const [rows, setRows] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [taskDraft, setTaskDraft] = useState<ApplicationTaskInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [taskError, setTaskError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<ApplicationHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [initialJobId, setInitialJobId] = useState<string | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobRefresh, setJobRefresh] = useState(0);
  const listVersion = useRef(0);
  const detailVersion = useRef(0);
  const historyVersion = useRef(0);
  const mutationLock = useRef(false);
  const saveToken = useRef<RequestToken | null>(null);
  const taskToken = useRef<RequestToken | null>(null);
  const restoreToken = useRef<RequestToken | null>(null);
  const panel = useRef<HTMLElement>(null);
  const editing = Boolean(draft || taskDraft);
  const busy = editing || saving || jobLoading;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const jobId = params.get('jobId');
    if (id && /^[A-Za-z0-9_-]{1,100}$/.test(id)) setSelectedId(id);
    else if (jobId && /^[a-f0-9]{64}$/.test(jobId)) setInitialJobId(jobId);
    else if (id || jobId) setError('지원 건 또는 공고 주소를 확인해 주세요.');
  }, []);

  useEffect(() => {
    if (!initialJobId) return;
    const abort = new AbortController();
    setJobLoading(true); setError('');
    void fetch(`/api/recruitment/jobs/${initialJobId}`, { cache: 'no-store', signal: abort.signal })
      .then(applicationResponse<JobDetail>)
      .then(job => {
        if (abort.signal.aborted) return;
        const application = { ...emptyApplication(), company: job.company ?? '', role: job.title, jobId: job.id };
        setDraft(draftFromApplication(crypto.randomUUID(), application));
        setDetail(null); setSelectedId(null); setJobLoading(false); setInitialJobId(null);
        saveToken.current = null;
      })
      .catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : '공고를 불러오지 못했습니다.'); })
      .finally(() => { if (!abort.signal.aborted) setJobLoading(false); });
    return () => abort.abort();
  }, [initialJobId, jobRefresh]);

  useEffect(() => {
    const abort = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || document.hidden || mutationLock.current) return;
      const version = ++listVersion.current;
      pending = true; setLoading(true);
      try {
        const result = await fetch('/api/recruitment/applications', { cache: 'no-store', signal: abort.signal }).then(applicationResponse<ApplicationSummary[]>);
        if (!abort.signal.aborted && version === listVersion.current) { setRows(result); setListError(''); }
      } catch (failure) {
        if (!abort.signal.aborted && version === listVersion.current) setListError(failure instanceof Error ? failure.message : '지원 목록을 불러오지 못했습니다.');
      } finally {
        pending = false;
        if (!abort.signal.aborted && version === listVersion.current) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 15_000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { abort.abort(); ++listVersion.current; window.clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [refresh]);

  useEffect(() => {
    if (!selectedId || editing) return;
    const abort = new AbortController();
    let pending = false;
    let first = true;
    const load = async () => {
      if (pending || document.hidden || mutationLock.current) return;
      const initial = first;
      first = false; pending = true;
      const version = ++detailVersion.current;
      if (initial) setDetailLoading(true);
      try {
        const result = await fetch(`/api/recruitment/applications/${encodeURIComponent(selectedId)}`, { cache: 'no-store', signal: abort.signal }).then(applicationResponse<ApplicationDetail>);
        if (!abort.signal.aborted && version === detailVersion.current && !mutationLock.current) {
          setDetail(result);
          if (initial) setError('');
        }
      } catch (failure) {
        if (!abort.signal.aborted && version === detailVersion.current && !mutationLock.current) setError(failure instanceof Error ? failure.message : '지원 건을 불러오지 못했습니다.');
      } finally {
        pending = false;
        if (!abort.signal.aborted && version === detailVersion.current) setDetailLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 15_000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { abort.abort(); ++detailVersion.current; window.clearInterval(timer); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [selectedId, editing, refresh]);

  useEffect(() => {
    if (selectedId && !draft) panel.current?.focus({ preventScroll: window.matchMedia('(min-width: 1280px)').matches });
  }, [selectedId, Boolean(draft)]);

  useEffect(() => {
    if (!editing && !saving) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    // Capture navigation synchronously so client routing cannot discard a draft before confirmation.
    const navigate = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (mutationLock.current || !window.confirm('저장하지 않은 내용이 있습니다. 이동할까요?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [editing, saving]);

  function clearHistory() { ++historyVersion.current; setHistory(null); setHistoryError(''); setHistoryLoading(false); }
  function open(id: string) {
    if (busy || selectedId === id) return;
    ++detailVersion.current; setInitialJobId(null); setDetail(null); setSelectedId(id); setError(''); setNotice(''); clearHistory();
  }
  function create() {
    if (busy) return;
    ++detailVersion.current; setInitialJobId(null); setDetailLoading(false); setSelectedId(null); setDetail(null); clearHistory();
    setDraft(draftFromApplication(crypto.randomUUID(), emptyApplication()));
    saveToken.current = null; setError(''); setNotice('');
  }
  function accept(result: ApplicationDetail) {
    ++detailVersion.current;
    setDetail(result); setSelectedId(result.application.id); setDraft(null); setTaskDraft(null); setDetailLoading(false);
    setError(''); setTaskError(''); clearHistory(); setRefresh(value => value + 1);
  }
  async function cancelDraft() {
    if (mutationLock.current || !await confirm({ message: '작성 중인 내용을 버릴까요?', confirmLabel: '변경 버리기', tone: 'danger' })) return;
    setDraft(null); setError(''); saveToken.current = null;
  }
  async function saveApplication() {
    if (!draft || mutationLock.current) return;
    let application;
    try {
      const result = applicationInputSchema.safeParse(inputFromDraft(draft));
      if (!result.success) throw new Error(result.error.issues[0]?.message || '입력값을 확인해 주세요.');
      application = result.data;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '입력값을 확인해 주세요.'); return; }
    const payload = { application, expectedRevision: draft.expectedRevision };
    const token = requestId(saveToken, { id: draft.id, ...payload });
    mutationLock.current = true; ++listVersion.current; setSaving(true); setError(''); setNotice('');
    try {
      const result = await fetch(`/api/recruitment/applications/${encodeURIComponent(draft.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId: token }) }).then(applicationResponse<ApplicationDetail>);
      accept(result); saveToken.current = null; setNotice('지원 건을 저장했습니다.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했습니다. 작성 내용은 유지됩니다.'); }
    finally { mutationLock.current = false; setSaving(false); }
  }
  function editTask(task?: ApplicationTask) {
    if (busy || !detail) return;
    ++detailVersion.current;
    setDetailLoading(false);
    setTaskDraft(task ? { id: task.id, title: task.title, done: task.done, placement: task.placement === 'today' ? 'today' : 'pool', startDate: task.startDate, endDate: task.endDate, expectedVersion: task.version }
      : { id: crypto.randomUUID(), title: '', done: false, placement: 'pool', startDate: null, endDate: null, expectedVersion: null });
    taskToken.current = null; setTaskError(''); setNotice('');
  }
  async function closeTask() {
    if (mutationLock.current || !await confirm({ message: '할 일의 변경 내용을 버릴까요?', confirmLabel: '변경 버리기', tone: 'danger' })) return;
    setTaskDraft(null); setTaskError(''); taskToken.current = null;
  }
  async function saveTask() {
    if (!taskDraft || !detail || mutationLock.current) return;
    const parsed = applicationTaskSchema.safeParse(taskDraft);
    if (!parsed.success) { setTaskError(parsed.error.issues[0]?.message || '할 일을 확인해 주세요.'); return; }
    const payload = { task: parsed.data, expectedRevision: detail.application.revision };
    const token = requestId(taskToken, { id: detail.application.id, ...payload });
    mutationLock.current = true; ++listVersion.current; setSaving(true); setTaskError('');
    try {
      const result = await fetch(`/api/recruitment/applications/${encodeURIComponent(detail.application.id)}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId: token }) }).then(applicationResponse<ApplicationDetail>);
      accept(result); taskToken.current = null; setNotice('할 일을 저장했습니다.');
    } catch (failure) { setTaskError(failure instanceof Error ? failure.message : '할 일을 저장하지 못했습니다. 작성 내용은 유지됩니다.'); }
    finally { mutationLock.current = false; setSaving(false); }
  }
  async function loadHistory() {
    if (!detail || busy) return;
    const version = ++historyVersion.current;
    setHistoryLoading(true); setHistoryError('');
    try {
      const result = await fetch(`/api/recruitment/applications/${encodeURIComponent(detail.application.id)}/history`, { cache: 'no-store' }).then(applicationResponse<ApplicationHistoryEntry[]>);
      if (version === historyVersion.current) setHistory(result);
    } catch (failure) { if (version === historyVersion.current) setHistoryError(failure instanceof Error ? failure.message : '이력을 불러오지 못했습니다.'); }
    finally { if (version === historyVersion.current) setHistoryLoading(false); }
  }
  async function restore(revision: number) {
    if (!detail || busy || mutationLock.current) return;
    const current = detail;
    if (!await confirm({ message: `지원 건을 버전 ${revision}의 내용으로 복원할까요? 현재 내용도 이력에 남습니다. 연결된 자료와 할 일의 본문은 바뀌지 않습니다.`, confirmLabel: '복원' }) || mutationLock.current) return;
    const payload = { revision, expectedRevision: current.application.revision };
    const token = requestId(restoreToken, { id: current.application.id, ...payload });
    mutationLock.current = true; ++listVersion.current; setSaving(true); setError('');
    try {
      const result = await fetch(`/api/recruitment/applications/${encodeURIComponent(current.application.id)}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId: token }) }).then(applicationResponse<ApplicationDetail>);
      accept(result); restoreToken.current = null; setNotice('새 버전으로 복원했습니다.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '복원하지 못했습니다.'); }
    finally { mutationLock.current = false; setSaving(false); }
  }

  const filtered = rows.filter(row => (!status || row.status === status) && (!priority || row.priority === priority) && `${row.company} ${row.role} ${row.nextAction}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = detail?.application.id === selectedId ? detail : null;
  const app = selected?.application;
  const showPanel = Boolean(selectedId || draft);
  return <div className="space-y-4 p-4 md:p-6">
    <ListToolbar wrap meta={`${filtered.length}건`} search={{ value: query, onChange: setQuery, placeholder: '회사·직무·다음 할 일 검색' }} actions={<><Button variant="secondary" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>새로고침</Button><Button disabled={busy} onClick={create}>지원 건 추가</Button></>}>
      <div className="w-36"><Dropdown ariaLabel="지원 상태 필터" value={status} onChange={setStatus} options={[{ value: '', label: '전체 지원 상태' }, ...Object.entries(applicationStatuses).map(([value, label]) => ({ value, label }))]} /></div>
      <div className="w-32"><Dropdown ariaLabel="우선순위 필터" value={priority} onChange={setPriority} options={[{ value: '', label: '전체 우선순위' }, ...Object.entries(applicationPriorities).map(([value, label]) => ({ value, label }))]} /></div>
    </ListToolbar>
    {listError && <p role="alert" className="text-sm text-[var(--bi-error)]">{listError}</p>}
    {error && !draft && <p role="alert" className="rounded border border-[var(--bi-error)] p-3 text-sm text-[var(--bi-error)]">{error}</p>}
    {initialJobId && !jobLoading && <Button variant="secondary" disabled={busy} onClick={() => setJobRefresh(value => value + 1)}>공고 다시 불러오기</Button>}
    {notice && <p role="status" className="text-sm text-[var(--bi-success)]">{notice}</p>}
    {jobLoading && <LoadingIndicator label="선택한 공고 조회 중" />}
    <div className={`grid min-w-0 items-start gap-5 ${showPanel ? 'xl:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]' : ''}`}>
      <section aria-label="지원 현황 목록" aria-busy={loading} className="min-w-0 overflow-hidden rounded-[var(--bi-radius-panel)] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--bi-border)] px-4 py-3 text-xs text-[var(--bi-muted)]"><span>내 지원 상태 · 한국 시간 기준</span>{loading && <LoadingIndicator label="목록 조회 중" />}{editing && <span>편집을 마치면 다른 지원 건을 열 수 있습니다.</span>}</div>
        <div className="overflow-x-auto"><div className="min-w-[660px]">
          <DataTable<ApplicationSummary> caption="지원 현황" rowKey={row => row.id} rows={filtered} emptyMessage={loading ? '지원 현황을 불러오는 중입니다.' : listError ? '목록을 불러오지 못했습니다. 새로고침을 눌러 주세요.' : rows.length ? '검색 조건에 맞는 지원 건이 없습니다.' : '지원 건을 추가해 지원 일정과 자료를 한곳에서 관리하세요.'} columns={[
            { key: 'company', header: '회사 · 직무', render: row => <Button id={`application-${row.id}`} variant="ghost" disabled={busy} aria-pressed={selectedId === row.id} aria-controls="application-detail" onClick={() => open(row.id)} className={`h-auto min-h-11 max-w-72 justify-start whitespace-normal text-left ${selectedId === row.id ? 'bg-[var(--bi-accent-light)]' : ''}`}><span><strong className="block">{row.company}</strong><span className="mt-1 block text-xs font-normal text-[var(--bi-muted)]">{row.role}</span></span></Button> },
            { key: 'status', header: '지원 상태', render: row => <Badge variant={statusTone(row.status)}>{applicationStatuses[row.status]}</Badge> },
            { key: 'deadline', header: '마감', render: row => <span className="text-xs">{date(row.deadlineAt)}</span> },
            { key: 'priority', header: '우선순위', render: row => <Badge variant={row.priority === 'HIGH' ? 'warning' : 'neutral'}>{applicationPriorities[row.priority]}</Badge> },
            { key: 'next', header: '다음 할 일', render: row => <span className="block max-w-60 truncate text-xs" title={row.nextAction}>{row.nextAction || '미정'}</span> },
          ]} />
        </div></div>
      </section>
      {showPanel && <section id="application-detail" ref={panel} tabIndex={-1} aria-label="지원 건 상세" aria-busy={detailLoading || saving} className="order-first min-w-0 rounded-[var(--bi-radius-panel)] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)] md:p-5 xl:order-last">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bi-border)] pb-4">
          <h2 className="text-base font-semibold">{draft ? draft.expectedRevision ? '지원 건 편집' : '새 지원 건' : '지원 건 상세'}</h2>
          {!draft && <div className="flex gap-2">{selected && <Button disabled={busy || detailLoading} onClick={() => { ++detailVersion.current; setDraft(draftFromApplication(selected.application.id, selected.application, selected.application.revision)); saveToken.current = null; setError(''); setNotice(''); clearHistory(); }}>편집</Button>}<Button variant="secondary" disabled={busy} onClick={() => { document.getElementById(`application-${selectedId}`)?.focus(); ++detailVersion.current; setSelectedId(null); setDetail(null); setDetailLoading(false); setError(''); clearHistory(); }}>닫기</Button></div>}
        </div>
        {draft ? <ApplicationEditor key={draft.id} draft={draft} detail={selected} saving={saving} error={error} onChange={next => { saveToken.current = null; setDraft(next); setError(''); }} onSave={() => void saveApplication()} onCancel={() => void cancelDraft()} /> : detailLoading ? <LoadingIndicator label="지원 건 조회 중" /> : selected && app ? <div className="space-y-6">
          <div><p className="text-sm text-[var(--bi-muted)]">{app.company}</p><h3 className="mt-1 break-words text-xl font-semibold">{app.role}</h3><div className="mt-3 flex flex-wrap gap-2"><Badge variant={statusTone(app.status)}>{applicationStatuses[app.status]}</Badge><Badge variant={app.priority === 'HIGH' ? 'warning' : 'neutral'}>우선순위 {applicationPriorities[app.priority]}</Badge></div></div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm"><dt className="text-[var(--bi-muted)]">마감 시각</dt><dd>{date(app.deadlineAt)}{app.deadlineAt && <span className="ml-1 text-xs text-[var(--bi-muted)]">(한국 시간)</span>}</dd><dt className="text-[var(--bi-muted)]">다음 할 일</dt><dd className="whitespace-pre-wrap break-words">{app.nextAction || '아직 정하지 않았습니다.'}</dd>{app.status === 'EXCLUDED' && <><dt className="text-[var(--bi-muted)]">제외 사유</dt><dd className="whitespace-pre-wrap break-words">{app.exclusionReason}</dd></>}</dl>
          {selected.missingLinks.length > 0 && <p role="status" className="rounded bg-[var(--bi-table-header)] p-3 text-xs leading-5 text-[var(--bi-muted)]">확인할 수 없는 연결 자료가 {selected.missingLinks.length}개 있습니다. 편집 화면에서 연결을 확인해 주세요.</p>}
          <section className="border-t border-[var(--bi-border)] pt-4"><h3 className="text-sm font-semibold">채용공고</h3>{selected.job ? <div className="mt-2 space-y-2"><p className="break-words text-sm">{selected.job.title}</p><Badge variant={selected.job.status === 'OPEN' ? 'success' : 'neutral'}>모집 상태: {jobStatuses[selected.job.status]}</Badge><p className="text-xs text-[var(--bi-muted)]">모집 상태와 내 지원 상태는 별도로 관리합니다.</p><a href={selected.job.url} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant: 'secondary' })}>공고 원문 ↗</a></div> : <p className="mt-2 text-xs text-[var(--bi-muted)]">{app.jobId ? '연결된 공고를 찾을 수 없습니다.' : '연결된 공고가 없습니다.'}</p>}</section>
          <section className="border-t border-[var(--bi-border)] pt-4"><h3 className="text-sm font-semibold">준비 자료</h3>{selected.documents.length ? <ul className="mt-2 divide-y divide-[var(--bi-border)]">{selected.documents.map(doc => <li key={doc.id} className="flex items-center gap-3 py-3"><Badge variant="neutral">{documentLabels[doc.kind]}</Badge><a href={documentHref(doc.kind, doc.id)} className="min-w-0 break-words text-sm text-[var(--bi-accent)] underline">{doc.title}</a></li>)}</ul> : <p className="mt-2 text-xs text-[var(--bi-muted)]">편집에서 경험, 자기소개서, 포트폴리오를 연결하세요.</p>}</section>
          <section className="border-t border-[var(--bi-border)] pt-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">할 일 <span className="font-normal text-[var(--bi-muted)]">{selected.tasks.filter(task => task.done).length}/{selected.tasks.length}</span></h3><Button variant="secondary" disabled={busy} onClick={() => editTask()}>할 일 추가</Button></div>{selected.tasks.length ? <ul className="mt-2 divide-y divide-[var(--bi-border)]">{selected.tasks.map(task => <li key={task.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className={`break-words text-sm ${task.done ? 'text-[var(--bi-muted)] line-through' : ''}`}>{task.title}</p><div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant={task.done ? 'success' : 'neutral'}>{task.done ? '완료' : task.placement === 'today' ? '오늘' : '할 일 풀'}</Badge><span className="text-xs text-[var(--bi-muted)]">{task.startDate && task.endDate ? `${task.startDate} ~ ${task.endDate}` : '일정 미정'}</span></div></div><Button variant="ghost" disabled={busy} aria-label={`${task.title} 편집`} onClick={() => editTask(task)}>편집</Button></li>)}</ul> : <p className="mt-2 text-xs text-[var(--bi-muted)]">새 할 일을 만들거나 편집에서 기존 개인 할 일을 연결하세요.</p>}</section>
          <section className="border-t border-[var(--bi-border)] pt-4"><h3 className="text-sm font-semibold">지원 메모</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{app.notes || '아직 작성한 메모가 없습니다.'}</p></section>
          <section className="border-t border-[var(--bi-border)] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--bi-muted)]">{date(app.updatedAt)} 수정 · 버전 {app.revision}</p><Button variant="ghost" disabled={busy || historyLoading} onClick={() => void loadHistory()}>변경 이력</Button></div>{historyLoading && <LoadingIndicator label="이력 조회 중" />}{historyError && <p role="alert" className="text-xs text-[var(--bi-error)]">{historyError}</p>}{history && <ul className="mt-2 divide-y divide-[var(--bi-border)]">{history.length === 0 && <li className="py-3 text-xs text-[var(--bi-muted)]">저장된 변경 이력이 없습니다.</li>}{history.map(entry => <li key={entry.revision} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span>버전 {entry.revision} · {date(entry.updatedAt)}</span>{entry.revision === app.revision ? <Badge variant="primary">현재</Badge> : <Button variant="secondary" disabled={busy} onClick={() => void restore(entry.revision)}>이 버전으로 복원</Button>}</li>)}</ul>}</section>
        </div> : <p className="text-sm text-[var(--bi-muted)]">지원 건을 불러오지 못했습니다. 새로고침을 눌러 주세요.</p>}
      </section>}
    </div>
    <FormModal open={Boolean(taskDraft)} title={taskDraft?.expectedVersion ? '할 일 편집' : '할 일 추가'} description="기존 개인 할 일과 함께 관리합니다." onClose={() => void closeTask()} onSubmit={() => void saveTask()} submitDisabled={saving} submitLabel={saving ? '저장 중…' : '할 일 저장'} closeOnBackdrop={!saving} closeOnEscape={!saving}>
      {taskDraft && <fieldset disabled={saving} className="min-w-0 space-y-4">
        {taskError && <p role="alert" className="text-sm text-[var(--bi-error)]">{taskError}</p>}
        <TextField label="할 일" value={taskDraft.title} maxLength={500} required autoFocus onChange={title => { taskToken.current = null; setTaskDraft({ ...taskDraft, title }); }} />
        <FormGrid><DateField label="시작일" value={taskDraft.startDate ?? ''} disabled={saving} onChange={startDate => { taskToken.current = null; setTaskDraft({ ...taskDraft, startDate: startDate || null }); }} /><DateField label="마감일" value={taskDraft.endDate ?? ''} disabled={saving} onChange={endDate => { taskToken.current = null; setTaskDraft({ ...taskDraft, endDate: endDate || null }); }} /></FormGrid>
        <p className="text-xs text-[var(--bi-muted)]">일정은 시작일과 마감일을 함께 지정하거나 모두 비워 주세요.</p>
        <SelectField label="배치" value={taskDraft.placement} disabled={saving} options={[{ value: 'pool', label: '할 일 풀' }, { value: 'today', label: '오늘의 할 일' }]} onChange={placement => { taskToken.current = null; setTaskDraft({ ...taskDraft, placement: placement as 'pool' | 'today' }); }} />
        <CheckboxField label="완료" checked={taskDraft.done} disabled={saving} onChange={done => { taskToken.current = null; setTaskDraft({ ...taskDraft, done }); }} />
      </fieldset>}
    </FormModal>
  </div>;
}
