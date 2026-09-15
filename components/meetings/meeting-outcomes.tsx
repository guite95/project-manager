"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FlowChart } from '@/components/flow/types';
import { Button } from '@/components/erp/button';
import { DateField, TextField } from '@/components/erp/form-field';
import { editMeetingOutcomes, type MeetingOutcomes as Outcomes } from '@/lib/meeting-edit';
import { MeetingOutcomesView } from './meeting-detail';

const inputClass = 'mt-1 min-h-20 w-full rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-3 text-[13px] outline-[var(--bi-accent)]';

export function MeetingOutcomes({ projectSlug, initialChart, initialRevision }: {
  projectSlug: string; initialChart: FlowChart; initialRevision: number;
}) {
  const router = useRouter();
  const [record, setRecord] = useState({ chart: initialChart, revision: initialRevision });
  const [draft, setDraft] = useState<Outcomes | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState('');
  const content = record.chart.content;
  const dirty = draft !== null && content?.kind === 'meeting' &&
    JSON.stringify(draft) !== JSON.stringify({ decisions: content.decisions, actionItems: content.actionItems });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (content?.kind !== 'meeting') return null;
  const path = `/api/flows/${encodeURIComponent(projectSlug)}/${encodeURIComponent(record.chart.slug)}`;

  const save = async () => {
    if (!draft || busyRef.current) return;
    setError(''); setMessage(''); setConflict(false);
    let next: FlowChart;
    try { next = editMeetingOutcomes(record.chart, draft); }
    catch (e) { setError(e instanceof Error ? e.message : '입력 내용을 확인해 주세요.'); return; }
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch(path, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart: next, revision: record.revision }),
      });
      if (response.status === 409) {
        setConflict(true);
        throw new Error('다른 곳에서 회의록이 수정되어 저장하지 못했습니다. 입력 내용은 유지됩니다. 필요한 내용을 복사한 뒤 최신 내용을 불러와 다시 편집해 주세요.');
      }
      if (response.status === 401) throw new Error('로그인이 만료되었습니다. 입력 내용을 복사한 뒤 다시 로그인해 주세요.');
      if (!response.ok) throw new Error('저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.');
      const result = await response.json();
      if (!Number.isSafeInteger(result.revision)) throw new Error('저장 결과를 확인하지 못했습니다. 최신 내용을 확인해 주세요.');
      setRecord({ chart: next, revision: result.revision });
      setDraft(null); setMessage('결정 사항과 태스크를 저장했습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다. 다시 시도해 주세요.');
    } finally { busyRef.current = false; setBusy(false); }
  };

  const reload = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error('최신 내용을 불러오지 못했습니다. 입력 내용은 유지됩니다.');
      const result = await response.json();
      if (result.chart?.content?.kind !== 'meeting' || !Number.isSafeInteger(result.revision)) {
        throw new Error('회의록이 변경되었거나 더 이상 존재하지 않습니다. 입력 내용은 유지됩니다.');
      }
      setRecord({ chart: result.chart, revision: result.revision });
      setDraft(null); setConflict(false); setMessage('최신 내용을 불러왔습니다.');
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : '최신 내용을 불러오지 못했습니다.'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return <div className="space-y-4">
    {!draft ? <div className="flex justify-end"><Button variant="secondary" className="min-h-10" onClick={() => {
      setDraft(structuredClone({ decisions: content.decisions, actionItems: content.actionItems }));
      setError(''); setMessage(''); setConflict(false);
    }}>결정 사항·태스크 편집</Button></div> : null}
    {message ? <p role="status" className="text-[12px] text-[var(--bi-success)]">{message}</p> : null}
    {draft ? <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="sr-only">결정 사항과 태스크 편집</legend>
        <section className="rounded-[3px] border border-[var(--bi-border)] p-5">
          <h2 className="mb-3 text-[14px] font-semibold">결정 사항</h2>
          <div className="space-y-3">{draft.decisions.map((decision, i) => <div key={i}>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`decision-${i}`} className="text-[12px]">결정 사항 {i + 1}</label>
              <Button variant="ghost" aria-label={`결정 사항 ${i + 1} 삭제`} onClick={() => setDraft({ ...draft, decisions: draft.decisions.filter((_, index) => index !== i) })}>삭제</Button>
            </div>
            <textarea id={`decision-${i}`} required className={inputClass} value={decision}
              onChange={e => setDraft({ ...draft, decisions: draft.decisions.map((value, index) => index === i ? e.target.value : value) })} />
          </div>)}</div>
          {!draft.decisions.length ? <p className="mb-3 text-[12px] text-[var(--bi-muted)]">등록된 결정 사항이 없습니다.</p> : null}
          <Button variant="secondary" className="mt-3 min-h-10" onClick={() => setDraft({ ...draft, decisions: [...draft.decisions, ''] })}>결정 사항 추가</Button>
        </section>
        <section className="rounded-[3px] border border-[var(--bi-border)] p-5">
          <h2 className="mb-3 text-[14px] font-semibold">태스크</h2>
          <div className="space-y-4">{draft.actionItems.map((item, i) => {
            const update = (changes: Partial<typeof item>) => setDraft({ ...draft, actionItems: draft.actionItems.map((value, index) => index === i ? { ...value, ...changes } : value) });
            return <div key={i} className="rounded-[3px] border border-[var(--bi-border)] p-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`task-${i}`} className="text-[12px] font-medium">태스크 {i + 1}</label>
                <Button variant="ghost" aria-label={`태스크 ${i + 1} 삭제`} onClick={() => setDraft({ ...draft, actionItems: draft.actionItems.filter((_, index) => index !== i) })}>삭제</Button>
              </div>
              <textarea id={`task-${i}`} required className={inputClass} value={item.task} onChange={e => update({ task: e.target.value })} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField label={`태스크 ${i + 1} 담당자`} value={item.owner ?? ''} placeholder="미지정" onChange={owner => update({ owner: owner || null })} />
                <DateField label={`태스크 ${i + 1} 기한`} value={item.dueDate ?? ''} placeholder="미정" clearable onChange={dueDate => update({ dueDate: dueDate || null })} />
              </div>
            </div>;
          })}</div>
          {!draft.actionItems.length ? <p className="mb-3 text-[12px] text-[var(--bi-muted)]">등록된 태스크가 없습니다.</p> : null}
          <Button variant="secondary" className="mt-3 min-h-10" onClick={() => setDraft({ ...draft, actionItems: [...draft.actionItems, { task: '', owner: null, dueDate: null }] })}>태스크 추가</Button>
        </section>
      </fieldset>
      {error ? <p role="alert" className="text-[12px] leading-6 text-[var(--bi-error)]">{error}</p> : null}
      {conflict ? <Button variant="secondary" disabled={busy} className="h-auto min-h-10 whitespace-normal" onClick={() => void reload()}>편집 취소하고 최신 내용 불러오기</Button> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} className="min-h-10" onClick={() => { setDraft(null); setError(''); setConflict(false); }}>취소</Button>
        <Button type="submit" disabled={!dirty || conflict} loading={busy} className="min-h-10">저장</Button>
      </div>
    </form> : <MeetingOutcomesView content={content} />}
  </div>;
}
