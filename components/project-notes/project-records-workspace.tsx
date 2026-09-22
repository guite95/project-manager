'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/erp/button';
import { emptyProjectRecords, overviewFields, workFields, type ProjectRecords, type ProjectWork } from '@/lib/project-records';
import type { ProjectNote } from '@/lib/project-notes';

const field = 'mt-2 w-full rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 py-2 text-sm font-normal focus:outline-2 focus:outline-[var(--bi-accent)]';
const card = 'min-w-0 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 md:p-5';
async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '기록을 처리하지 못했습니다.');
  return body;
}
function Text({ value }: { value: string }) {
  return <p className={`mt-2 whitespace-pre-wrap break-words text-sm leading-7 ${value ? '' : 'text-[var(--bi-muted)]'}`}>{value || '아직 작성하지 않았습니다.'}</p>;
}

export function ProjectRecordsWorkspace({ projectSlug }: { projectSlug: string }) {
  const [document, setDocument] = useState<ProjectRecords | null>(null);
  const [draft, setDraft] = useState<ProjectRecords | null>(null);
  const [legacyNotes, setLegacyNotes] = useState<ProjectNote[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const editing = draft !== null;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const current = draft ?? document;
  const work = current?.works.find(item => item.id === selected);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(document);
  const endpoint = `/api/personal-project-records/${encodeURIComponent(projectSlug)}`;

  useEffect(() => {
    const abort = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || editingRef.current || window.document.hidden) return;
      pending = true;
      try {
        const data = await fetch(endpoint, { cache: 'no-store', signal: abort.signal }).then(readResponse<{ document: ProjectRecords | null; legacyNotes: ProjectNote[] }>);
        // 조회를 시작한 뒤 편집을 열었을 때도 입력 중인 내용은 덮어쓰지 않는다.
        if (!abort.signal.aborted && !editingRef.current) {
          setDocument(data.document ?? emptyProjectRecords()); setLegacyNotes(data.legacyNotes); setReady(true); setError('');
        }
      } catch { if (!abort.signal.aborted) setError('기록을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.'); }
      finally { pending = false; }
    };
    void load();
    const timer = setInterval(load, 15_000);
    window.addEventListener('focus', load);
    window.document.addEventListener('visibilitychange', load);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', load); window.document.removeEventListener('visibilitychange', load); };
  }, [endpoint, refresh]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm('저장하지 않은 기록이 있습니다. 이 화면을 나갈까요?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    window.document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); window.document.removeEventListener('click', navigate, true); };
  }, [dirty]);

  function edit() {
    if (!document) return;
    editingRef.current = true; setDraft(structuredClone(document)); setNotice(''); setError('');
  }
  function addWork() {
    if (!current) return;
    const id = crypto.randomUUID();
    editingRef.current = true;
    setDraft({ ...structuredClone(current), works: [...current.works, { id, title: '', summary: '', work: '', decisions: '', results: '', evidence: '' }] });
    setSelected(id); setNotice(''); setError('');
  }
  function updateWork(key: keyof ProjectWork, value: string) {
    setDraft(previous => previous ? { ...previous, works: previous.works.map(item => item.id === selected ? { ...item, [key]: value } : item) } : previous);
  }
  function cancel() {
    if (dirty && !window.confirm('작성 중인 변경 사항을 취소할까요?')) return;
    setDraft(null); editingRef.current = false; setError(''); setRefresh(value => value + 1);
  }
  function removeWork() {
    if (!draft || !work || !window.confirm(`‘${work.title || '새 작업'}’을 삭제할까요? 저장하면 반영됩니다.`)) return;
    setDraft({ ...draft, works: draft.works.filter(item => item.id !== selected) }); setSelected(null);
  }
  async function save() {
    if (!draft) return;
    setSaving(true); setError('');
    try {
      const untitled = draft.works.find(item => !item.title.trim());
      if (untitled) { setSelected(untitled.id); throw new Error('작업 제목을 입력해 주세요.'); }
      const saved = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: draft, expectedRevision: draft.revision }) }).then(readResponse<ProjectRecords>);
      setDocument(saved); setDraft(null); editingRef.current = false; setNotice('기록을 저장했습니다.'); setRefresh(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다. 작성 내용은 유지됩니다.'); }
    finally { setSaving(false); }
  }
  async function copy() {
    if (!current) return;
    const text = ['프로젝트 개요', ...overviewFields.map(({ key, title }) => `${title}\n${current.overview[key]}`), ...current.works.flatMap(item => [item.title, item.summary, ...workFields.map(({ key, title }) => `${title}\n${item[key]}`)])].join('\n\n');
    try { await navigator.clipboard.writeText(text); setNotice('기록 내용을 복사했습니다.'); }
    catch { setError('복사하지 못했습니다. 필요한 내용을 직접 선택해 복사해 주세요.'); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-[var(--bi-muted)]">{editing ? '프로젝트 개요와 작업 기록을 편집 중입니다.' : document?.updatedAt ? `${new Date(document.updatedAt).toLocaleString('ko-KR')} 수정` : '프로젝트에서 직접 맡은 일과 판단 근거를 기록하세요.'}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={editing} onClick={() => setRefresh(value => value + 1)}>다시 불러오기</Button>
        <Button variant="secondary" disabled={!ready} onClick={copy}>내용 복사</Button>
        {editing ? <><Button variant="secondary" disabled={saving} onClick={cancel}>취소</Button><Button loading={saving} onClick={save}>저장</Button></> : <Button disabled={!ready} onClick={edit}>편집</Button>}
      </div>
    </div>
    {error && <p role="alert" className="rounded border border-[var(--bi-error)] p-3 text-sm text-[var(--bi-error)]">{error}</p>}
    <p role="status" className="text-xs text-[var(--bi-muted)]">{notice}</p>
    {!ready || !current ? <p className="py-8 text-sm text-[var(--bi-muted)]">{error ? '기록을 불러오면 작성할 수 있습니다.' : '기록을 불러오는 중입니다.'}</p> : <>
      <section className={card} aria-labelledby="project-overview-title">
        <h2 id="project-overview-title" className="text-base font-semibold">프로젝트 개요</h2>
        <fieldset disabled={saving} className="mt-4 grid min-w-0 gap-5 sm:grid-cols-2">
          {overviewFields.map(({ key, title, hint }) => <div key={key} className="min-w-0">
            {draft ? <label className="block text-xs font-semibold">{title}<textarea className={field} rows={key === 'period' || key === 'participants' ? 2 : 4} maxLength={20_000} placeholder={hint} value={draft.overview[key]} onChange={event => setDraft({ ...draft, overview: { ...draft.overview, [key]: event.target.value } })} /></label> : <><h3 className="text-xs font-semibold text-[var(--bi-muted)]">{title}</h3><Text value={current.overview[key]} /></>}
          </div>)}
        </fieldset>
      </section>
      <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">작업별 상세 기록</h2><Button variant="secondary" disabled={saving || current.works.length >= 100} onClick={addWork}>작업 추가</Button></div>
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="작업 목록" className="min-w-0 overflow-hidden rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
          {!current.works.length ? <p className="p-4 text-sm leading-6 text-[var(--bi-muted)]">작업을 추가해 개발·개선·문제 해결 과정을 정리하세요.</p> : current.works.map(item => <button key={item.id} type="button" disabled={saving} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} className={`block w-full border-b border-[var(--bi-border)] p-4 text-left last:border-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--bi-accent)] ${selected === item.id ? 'bg-[var(--bi-sidebar-active)]' : 'hover:bg-[var(--bi-bg)]'}`}>
            <strong className="block break-words text-sm">{item.title || '새 작업'}</strong><span className="mt-1 block line-clamp-2 break-words text-xs leading-5 text-[var(--bi-muted)]">{item.summary || '요약을 작성해 주세요.'}</span>
          </button>)}
        </aside>
        <section aria-label="작업 상세" className={card}>
          {!work ? <p className="py-10 text-center text-sm text-[var(--bi-muted)]">작업을 선택하거나 새 작업을 추가하세요.</p> : <fieldset disabled={saving} className="min-w-0 space-y-6">
            {draft && <div className="flex justify-end"><Button variant="danger-ghost" disabled={saving} onClick={removeWork}>작업 삭제</Button></div>}
            {draft ? <div className="space-y-4"><label className="block text-xs font-semibold">작업 제목<input className={field} maxLength={200} value={work.title} onChange={event => updateWork('title', event.target.value)} placeholder="예: 대용량 업로드 실패 원인 분석과 개선" /></label><label className="block text-xs font-semibold">요약<textarea className={field} rows={2} maxLength={2000} value={work.summary} onChange={event => updateWork('summary', event.target.value)} placeholder="맡은 작업과 결과를 짧게 정리하세요." /></label></div> : <div><h3 className="break-words text-lg font-semibold">{work.title}</h3>{work.summary && <Text value={work.summary} />}</div>}
            {workFields.map(({ key, title, hint }) => <div key={key} className="border-t border-[var(--bi-border)] pt-4">
              {draft ? <label className="block text-sm font-semibold">{title}<textarea className={field} rows={6} maxLength={20_000} value={work[key]} onChange={event => updateWork(key, event.target.value)} placeholder={hint} /></label> : <><h4 className="text-sm font-semibold">{title}</h4><Text value={work[key]} /></>}
            </div>)}
          </fieldset>}
        </section>
      </div>
      {legacyNotes.length > 0 && <details className={card}><summary className="cursor-pointer text-sm font-semibold">이전 메모 ({legacyNotes.length})</summary><p className="mt-3 text-xs text-[var(--bi-muted)]">기존에 작성한 메모입니다. 필요한 내용을 위 기록에 옮겨 정리할 수 있습니다.</p><div className="mt-3 divide-y divide-[var(--bi-border)]">{legacyNotes.map(note => <div key={note.id} className="py-3"><Text value={note.content} /></div>)}</div></details>}
    </>}
  </div>;
}
