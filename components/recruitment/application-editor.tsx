'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/erp/button';
import { DateField, FieldLabel, SelectField, TextArea, TextField } from '@/components/erp/form-field';
import { FormActions, FormGrid } from '@/components/erp/form-layout';
import { LoadingIndicator } from '@/components/erp/loading-indicator';
import { applicationPriorities, applicationStatuses, type ApplicationDetail, type ApplicationInput, type ApplicationTask } from '@/lib/recruitment-applications';
import { jobStatuses, type JobPage, type JobSummary } from '@/lib/recruitment-jobs';
import type { RecruitmentKind, RecruitmentSummary } from '@/lib/recruitment';
import type { ApplicationDraft } from './application-draft';

export async function applicationResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(response.status === 409
    ? `${body?.message || '다른 곳에서 변경되었습니다.'} 작성 내용은 유지됩니다. 취소 후 최신 내용을 불러와 다시 편집해 주세요.`
    : body?.message || '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  return body as T;
}

export function documentHref(kind: RecruitmentKind, id: string) {
  const route = kind === 'PORTFOLIO' ? '/portfolio' : kind === 'EXPERIENCE' ? '/recruitment/experiences' : '/recruitment/cover-letters';
  return `${route}?id=${encodeURIComponent(id)}`;
}

function JobPicker({ value, selected, disabled, onChange }: { value: string | null; selected: JobSummary | null; disabled: boolean; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<JobPage | null>(null);
  const [known, setKnown] = useState<Record<string, JobSummary>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/recruitment/jobs?${new URLSearchParams({ q: query, page: String(page) })}`, { cache: 'no-store', signal: abort.signal })
        .then(applicationResponse<JobPage>)
        .then(result => {
          if (abort.signal.aborted) return;
          setData(result); setError('');
          setKnown(current => ({ ...current, ...Object.fromEntries(result.items.map(job => [job.id, job])) }));
        })
        .catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : '공고를 불러오지 못했습니다.'); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [query, page, refresh]);
  const current = value ? known[value] ?? (selected?.id === value ? selected : null) : null;
  const options = (data?.items ?? []).map(job => ({ value: job.id, label: `${job.company || '회사 미확인'} · ${job.title} (${jobStatuses[job.status]})` }));
  if (value && !options.some(option => option.value === value)) options.unshift({ value, label: current ? `${current.company || '회사 미확인'} · ${current.title}` : `연결된 공고 (${value.slice(0, 12)}…)` });
  return <div className="space-y-3">
    <TextField label="연결할 공고 검색" type="search" value={query} maxLength={150} disabled={disabled} onChange={value => { setQuery(value); setPage(1); }} placeholder="회사명 또는 공고명" />
    <SelectField label="채용공고" value={value ?? ''} onChange={id => onChange(id || null)} disabled={disabled} options={[{ value: '', label: '공고 연결 안 함' }, ...options]} />
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--bi-muted)]">
      {loading ? <LoadingIndicator label="공고 조회 중" /> : <span>{data?.total ?? 0}건 · {page} / {Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit || 30)))}</span>}
      <Button variant="ghost" disabled={disabled || loading || page <= 1} onClick={() => setPage(value => value - 1)}>이전</Button>
      <Button variant="ghost" disabled={disabled || loading || !data || page * data.limit >= data.total} onClick={() => setPage(value => value + 1)}>다음</Button>
    </div>
    {error && <div role="alert" className="text-xs text-[var(--bi-error)]">{error} <Button variant="ghost" disabled={disabled || loading} onClick={() => setRefresh(value => value + 1)}>다시 조회</Button></div>}
  </div>;
}

type ReferenceOption = { id: string; title: string; href?: string };
function ReferencePicker({ label, ids, options, disabled, onChange }: { label: string; ids: string[]; options: ReferenceOption[]; disabled: boolean; onChange: (ids: string[]) => void }) {
  return <div className="space-y-2">
    <SelectField label={`${label} 연결`} value="" disabled={disabled || ids.length >= 100} onChange={id => { if (id) onChange([...ids, id]); }} options={[{ value: '', label: `${label} 선택` }, ...options.filter(option => !ids.includes(option.id)).map(option => ({ value: option.id, label: option.title }))]} />
    {ids.length === 0 ? <p className="text-xs text-[var(--bi-muted)]">연결한 {label}{label === '자기소개서' || label === '포트폴리오' ? '가' : '이'} 없습니다.</p> : <ul className="divide-y divide-[var(--bi-border)]">
      {ids.map(id => { const option = options.find(option => option.id === id); return <li key={id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
        <span className="min-w-0 break-words">{option?.href ? <a href={option.href} target="_blank" rel="noopener noreferrer" className="text-[var(--bi-accent)] underline">{option.title} ↗</a> : option?.title ?? `연결 자료 (${id})`}</span>
        <Button variant="ghost" disabled={disabled} aria-label={`${option?.title ?? id} 연결 해제`} onClick={() => onChange(ids.filter(value => value !== id))}>해제</Button>
      </li>; })}
    </ul>}
  </div>;
}

export function ApplicationEditor({ draft, detail, saving, error, onChange, onSave, onCancel }: {
  draft: ApplicationDraft; detail: ApplicationDetail | null; saving: boolean; error: string;
  onChange: (draft: ApplicationDraft) => void; onSave: () => void; onCancel: () => void;
}) {
  const [documents, setDocuments] = useState<RecruitmentSummary[]>(detail?.documents ?? []);
  const [tasks, setTasks] = useState<ApplicationTask[]>(detail?.tasks ?? []);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    const kinds = ['EXPERIENCE', 'COVER_LETTER', 'PORTFOLIO'] as const;
    void Promise.allSettled([
      ...kinds.map(kind => fetch(`/api/recruitment?kind=${kind}`, { cache: 'no-store', signal: abort.signal }).then(applicationResponse<RecruitmentSummary[]>)),
      fetch(`/api/recruitment/applications/tasks?${new URLSearchParams({ applicationId: draft.id })}`, { cache: 'no-store', signal: abort.signal }).then(applicationResponse<ApplicationTask[]>),
    ]).then(results => {
      if (abort.signal.aborted) return;
      const failures: string[] = [];
      const labels = ['경험', '자기소개서', '포트폴리오', '할 일'];
      const loaded: RecruitmentSummary[] = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') failures.push(`${labels[index]} 목록을 불러오지 못했습니다.`);
        else if (index < 3) loaded.push(...result.value as RecruitmentSummary[]);
        else setTasks(result.value as ApplicationTask[]);
      });
      setDocuments(current => [...new Map([...current, ...loaded].map(doc => [doc.id, doc])).values()]);
      setErrors(failures); setLoading(false);
    });
    return () => abort.abort();
  }, [draft.id, refresh]);
  const update = (patch: Partial<ApplicationInput>) => onChange({ ...draft, application: { ...draft.application, ...patch } });
  const app = draft.application;
  const documentOptions = (kind: RecruitmentKind) => documents.filter(doc => doc.kind === kind).map(doc => ({ id: doc.id, title: `${doc.project ? `${doc.project} · ` : ''}${doc.title}`, href: documentHref(kind, doc.id) }));
  return <form className="space-y-6" onSubmit={event => { event.preventDefault(); onSave(); }}>
    <fieldset disabled={saving} className="min-w-0 space-y-6">
      <FormGrid>
        <TextField label="회사" value={app.company} onChange={company => update({ company })} maxLength={200} required autoFocus />
        <TextField label="지원 직무" value={app.role} onChange={role => update({ role })} maxLength={200} required />
        <SelectField label="내 지원 상태" value={app.status} onChange={status => update({ status: status as ApplicationInput['status'] })} disabled={saving} options={Object.entries(applicationStatuses).map(([value, label]) => ({ value, label }))} />
        <SelectField label="우선순위" value={app.priority} onChange={priority => update({ priority: priority as ApplicationInput['priority'] })} disabled={saving} options={Object.entries(applicationPriorities).map(([value, label]) => ({ value, label }))} />
      </FormGrid>
      {app.status === 'EXCLUDED' && <FieldLabel label="제외 사유 (필수)"><TextArea className="mt-1" rows={3} required maxLength={2000} value={app.exclusionReason} onChange={event => update({ exclusionReason: event.target.value })} /></FieldLabel>}
      <div className="space-y-2">
        <FormGrid>
          <DateField label="마감 날짜" value={draft.deadlineDate} disabled={saving} onChange={deadlineDate => onChange({ ...draft, deadlineDate, deadlineChanged: true })} />
          <TextField label="마감 시간 (24시간 HH:mm)" value={draft.deadlineTime} maxLength={5} placeholder="예: 18:00" onChange={deadlineTime => onChange({ ...draft, deadlineTime, deadlineChanged: true })} />
        </FormGrid>
        <p className="text-xs leading-5 text-[var(--bi-muted)]">시간대: Asia/Seoul (UTC+09:00). 날짜와 시간을 함께 입력하거나 모두 비워 주세요. 시간이 미확인인 원문 날짜는 지원 메모에 남겨 주세요.</p>
      </div>
      <TextField label="다음 할 일" value={app.nextAction} maxLength={1000} onChange={nextAction => update({ nextAction })} placeholder="예: 지원서 문항 확인" />
      <FieldLabel label="지원 메모"><TextArea className="mt-1" rows={5} maxLength={10000} value={app.notes} onChange={event => update({ notes: event.target.value })} /></FieldLabel>
      <section className="space-y-4 border-t border-[var(--bi-border)] pt-5">
        <h3 className="text-sm font-semibold">연결 자료</h3>
        <JobPicker value={app.jobId} selected={detail?.job ?? null} disabled={saving} onChange={jobId => update({ jobId })} />
        {loading && <LoadingIndicator label="자료와 할 일 목록 조회 중" />}
        {errors.length > 0 && <div role="alert" className="text-xs text-[var(--bi-error)]">{errors.join(' ')} <Button variant="ghost" disabled={saving || loading} onClick={() => setRefresh(value => value + 1)}>다시 조회</Button></div>}
        <ReferencePicker label="경험" ids={app.experienceIds} options={documentOptions('EXPERIENCE')} disabled={saving} onChange={experienceIds => update({ experienceIds })} />
        <ReferencePicker label="자기소개서" ids={app.coverLetterIds} options={documentOptions('COVER_LETTER')} disabled={saving} onChange={coverLetterIds => update({ coverLetterIds })} />
        <ReferencePicker label="포트폴리오" ids={app.portfolioIds} options={documentOptions('PORTFOLIO')} disabled={saving} onChange={portfolioIds => update({ portfolioIds })} />
        <ReferencePicker label="할 일" ids={app.taskIds} options={tasks.map(task => ({ id: task.id, title: `${task.done ? '[완료] ' : ''}${task.title}` }))} disabled={saving} onChange={taskIds => update({ taskIds })} />
        <p className="text-xs leading-5 text-[var(--bi-muted)]">연결을 해제해도 원본 자료와 할 일은 유지됩니다. 새 할 일은 지원 건을 저장한 후 만들 수 있습니다.</p>
      </section>
    </fieldset>
    {error && <p role="alert" className="rounded border border-[var(--bi-error)] p-3 text-sm text-[var(--bi-error)]">{error}</p>}
    <FormActions><Button variant="secondary" disabled={saving} onClick={onCancel}>취소</Button><Button type="submit" loading={saving}>지원 건 저장</Button></FormActions>
  </form>;
}
