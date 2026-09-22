'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/erp/button';
import { recruitmentText, type RecruitmentDocument, type RecruitmentKind, type RecruitmentScope, type RecruitmentSummary } from '@/lib/recruitment';

const field = 'w-full rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--bi-accent)]';
const scopeLabels = { COMPANY: '회사', PERSONAL: '개인·팀', GENERAL: '공통' };
const date = (value: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(new Date(value));
async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '요청을 처리하지 못했습니다.');
  return body as T;
}

export function RecruitmentWorkspace({ kind }: { kind: RecruitmentKind }) {
  const experience = kind === 'EXPERIENCE';
  const [rows, setRows] = useState<RecruitmentSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [document, setDocument] = useState<RecruitmentDocument | null>(null);
  const [draft, setDraft] = useState<RecruitmentDocument | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(document);

  useEffect(() => {
    const abort = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || window.document.hidden) return;
      pending = true;
      try {
        const data = await fetch(`/api/recruitment?kind=${kind}`, { cache: 'no-store', signal: abort.signal }).then(responseJson<RecruitmentSummary[]>);
        if (!abort.signal.aborted) { setRows(data); setReady(true); }
      } catch { if (!abort.signal.aborted) setError('목록을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.'); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    window.document.addEventListener('visibilitychange', refresh);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); window.document.removeEventListener('visibilitychange', refresh); };
  }, [kind, refreshVersion]);

  useEffect(() => {
    if (!selectedId || editing) return;
    const abort = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || window.document.hidden) return;
      pending = true;
      try {
        const data = await fetch(`/api/recruitment/${selectedId}`, { cache: 'no-store', signal: abort.signal }).then(responseJson<RecruitmentDocument>);
        if (!abort.signal.aborted) setDocument(data);
      } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : '문서를 불러오지 못했습니다.'); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    window.document.addEventListener('visibilitychange', refresh);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); window.document.removeEventListener('visibilitychange', refresh); };
  }, [selectedId, editing, refreshVersion]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]') && !window.confirm('저장하지 않은 내용이 있습니다. 이동할까요?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    window.document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); window.document.removeEventListener('click', navigate, true); };
  }, [dirty]);

  const projects = useMemo(() => [...new Set(rows.map(row => row.project).filter(Boolean))].sort(), [rows]);
  const filtered = rows.filter(row => (!project || row.project === project) && `${row.title} ${row.summary} ${row.project} ${row.tags.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const current = editing ? draft : document;
  function open(id: string) { setDocument(null); setSelectedId(id); setError(''); setNotice(''); }
  function create() {
    const titles = experience ? ['상황·문제', '본인 작업', '산출물·결과', '확인된 근거', '미확인 사항', '추가할 내용'] : ['지원 회사·직무', '문항·글자 수', '활용할 경험 ID와 근거', '자기소개서 초안'];
    const newDocument: RecruitmentDocument = { id: crypto.randomUUID(), kind, title: '', project: '', scope: 'GENERAL', summary: '', tags: [], sections: titles.map(title => ({ title, body: '' })), sourceUrls: [], revision: 0, updatedAt: new Date().toISOString() };
    setSelectedId(newDocument.id); setDocument(null); setDraft(newDocument); setEditing(true); setError(''); setNotice('');
  }
  async function save() {
    if (!draft) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await fetch(`/api/recruitment/${draft.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: draft, expectedRevision: draft.revision }) }).then(responseJson<RecruitmentDocument>);
      setDocument(saved); setDraft(null); setEditing(false); setNotice('저장했습니다.'); setRefreshVersion(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : '저장하지 못했습니다. 작성 내용은 유지됩니다.'); }
    finally { setSaving(false); }
  }
  async function copy() {
    if (!current) return;
    try { await navigator.clipboard.writeText(recruitmentText(current)); setNotice('내용과 근거를 복사했습니다.'); }
    catch { setError('복사하지 못했습니다. 편집 화면에서 내용을 선택해 복사해 주세요.'); }
  }
  function cancel() {
    if (dirty && !window.confirm('작성 중인 변경 내용을 버릴까요?')) return;
    setEditing(false); setDraft(null); setError('');
    if (!document) setSelectedId(null);
  }

  return <div className="p-4 md:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-[var(--bi-muted)]">{experience ? '프로젝트별 경험과 근거를 정리하고, 필요한 내용을 복사해 자기소개서에 활용하세요.' : '지원 회사와 문항별로 초안을 작성하세요. 경험정리의 ID를 함께 남기면 근거를 다시 찾기 쉽습니다.'}</p>
      <div className="flex gap-2"><Button variant="secondary" disabled={editing} onClick={() => { setError(''); setRefreshVersion(value => value + 1); }}>다시 불러오기</Button><Button disabled={editing} onClick={create}>{experience ? '경험 추가' : '자기소개서 작성'}</Button></div>
    </div>
    {error && <p role="alert" className="mb-4 rounded border border-[var(--bi-error)] p-3 text-sm text-[var(--bi-error)]">{error}</p>}
    <p role="status" className="mb-2 text-xs text-[var(--bi-muted)]">{notice}</p>
    <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)]" aria-label={experience ? '경험 목록' : '자기소개서 목록'}>
        <div className="space-y-2 border-b border-[var(--bi-border)] p-3">
          <input aria-label="제목·요약·태그 검색" placeholder="제목·요약·태그 검색" className={field} value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label={experience ? '프로젝트 필터' : '지원 회사 필터'} className={field} value={project} onChange={event => setProject(event.target.value)}><option value="">{experience ? '전체 프로젝트' : '전체 지원 회사'}</option>{projects.map(value => <option key={value} value={value}>{value}</option>)}</select>
          <p className="text-xs text-[var(--bi-muted)]">{filtered.length}개{editing ? ' · 편집을 마치면 다른 문서를 열 수 있습니다.' : ''}</p>
        </div>
        <div className="max-h-[40vh] overflow-y-auto lg:max-h-[70vh]">
          {!ready ? <p className="p-4 text-sm text-[var(--bi-muted)]">목록을 불러오는 중입니다.</p> : !filtered.length ? <p className="p-4 text-sm text-[var(--bi-muted)]">{rows.length ? '검색 결과가 없습니다.' : experience ? '등록된 경험이 없습니다.' : '아직 작성한 자기소개서가 없습니다.'}</p> : filtered.map(row => <button key={row.id} type="button" disabled={editing} aria-pressed={selectedId === row.id} onClick={() => open(row.id)} className={`block w-full border-b border-[var(--bi-border)] px-4 py-3 text-left last:border-b-0 disabled:cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--bi-accent)] ${selectedId === row.id ? 'bg-[var(--bi-sidebar-active)]' : 'hover:bg-[var(--bi-bg)]'}`}>
            <span className="block text-[11px] text-[var(--bi-muted)]">{row.project || scopeLabels[row.scope]}</span><strong className="mt-1 block text-sm">{row.title}</strong><span className="mt-1 block line-clamp-2 text-xs leading-5 text-[var(--bi-muted)]">{row.summary}</span>
          </button>)}
        </div>
      </aside>
      <section className="min-w-0 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-4 md:p-6" aria-label="문서 상세">
        {!current ? <p className="py-12 text-center text-sm text-[var(--bi-muted)]">{selectedId ? '문서를 불러오는 중입니다.' : '목록에서 문서를 선택하거나 새로 작성하세요.'}</p> : <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bi-border)] pb-4">
            <p className="text-xs text-[var(--bi-muted)]">{current.revision ? `${date(current.updatedAt)} 수정` : '새 문서'}</p>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={copy}>내용 복사</Button>{editing ? <><Button variant="secondary" disabled={saving} onClick={cancel}>취소</Button><Button loading={saving} onClick={save}>저장</Button></> : <Button onClick={() => { setDraft(structuredClone(current)); setEditing(true); setNotice(''); }}>편집</Button>}</div>
          </div>
          {editing && draft ? <fieldset disabled={saving} className="min-w-0 space-y-5">
            <label className="block text-xs font-semibold">제목<input className={`${field} mt-1`} maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">{experience ? '프로젝트' : '지원 회사'}<input className={`${field} mt-1`} maxLength={200} value={draft.project} onChange={event => setDraft({ ...draft, project: event.target.value })} /></label><label className="block text-xs font-semibold">구분<select className={`${field} mt-1`} value={draft.scope} onChange={event => setDraft({ ...draft, scope: event.target.value as RecruitmentScope })}>{Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <label className="block text-xs font-semibold">요약<textarea className={`${field} mt-1`} rows={3} maxLength={2000} value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} /></label>
            <label className="block text-xs font-semibold">태그 (쉼표로 구분)<input className={`${field} mt-1`} value={draft.tags.join(',')} onChange={event => setDraft({ ...draft, tags: event.target.value.split(',') })} /></label>
            {draft.sections.map((section, index) => <div key={index} className="space-y-2 border-t border-[var(--bi-border)] pt-4">
              <label className="block text-xs font-semibold">항목 제목<input className={`${field} mt-1`} maxLength={100} value={section.title} onChange={event => setDraft({ ...draft, sections: draft.sections.map((value, i) => i === index ? { ...value, title: event.target.value } : value) })} /></label>
              <label className="block text-xs font-semibold">내용<textarea className={`${field} mt-1 min-h-32 leading-7`} rows={Math.min(16, Math.max(4, section.body.split('\n').length + 2))} maxLength={80000} value={section.body} onChange={event => setDraft({ ...draft, sections: draft.sections.map((value, i) => i === index ? { ...value, body: event.target.value } : value) })} /></label>
              <Button variant="ghost" disabled={draft.sections.length <= 1} onClick={() => { if (!section.body || window.confirm('이 항목의 내용을 제거할까요? 저장 전까지는 취소할 수 있습니다.')) setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) }); }}>항목 제거</Button>
            </div>)}
            <Button variant="secondary" disabled={draft.sections.length >= 30} onClick={() => setDraft({ ...draft, sections: [...draft.sections, { title: '추가 내용', body: '' }] })}>항목 추가</Button>
            <label className="block text-xs font-semibold">출처 링크 (한 줄에 하나)<textarea className={`${field} mt-1`} rows={3} value={draft.sourceUrls.join('\n')} onChange={event => setDraft({ ...draft, sourceUrls: event.target.value.split('\n') })} /></label>
          </fieldset> : <article>
            <p className="text-xs text-[var(--bi-muted)]">{scopeLabels[current.scope]}{current.project && ` · ${current.project}`}</p>
            <h3 className="mt-2 text-xl font-bold break-words">{current.title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{current.summary}</p>
            {!!current.tags.length && <div className="mt-3 flex flex-wrap gap-2">{current.tags.map(tag => <span key={tag} className="rounded bg-[var(--bi-bg)] px-2 py-1 text-xs text-[var(--bi-muted)]">{tag}</span>)}</div>}
            <div className="mt-6 space-y-6">{current.sections.map((section, index) => <section key={index} className="border-t border-[var(--bi-border)] pt-4"><h4 className="text-sm font-bold">{section.title}</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{section.body || '아직 작성하지 않았습니다.'}</p></section>)}</div>
            {!!current.sourceUrls.length && <section className="mt-6 border-t border-[var(--bi-border)] pt-4"><h4 className="text-sm font-bold">원본 자료</h4><ul className="mt-2 space-y-2">{current.sourceUrls.map((url, index) => <li key={`${url}-${index}`}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-[var(--bi-accent)] underline">{url.includes('drive.google.com') || url.includes('docs.google.com') ? `Google Drive 자료 ${index + 1}` : url}</a></li>)}</ul></section>}
          </article>}
        </>}
      </section>
    </div>
  </div>;
}
