"use client";

import { useId, useRef, useState, type ReactNode } from 'react';
import type { MeetingContent } from '@/lib/meetings';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-5">
    <h2 className="mb-3 text-[14px] font-semibold">{title}</h2>
    <div className="text-[13px] leading-7">{children}</div>
  </section>;
}

export function MeetingDetail({ content, outcomes }: { content: MeetingContent; outcomes?: ReactNode }) {
  const [tab, setTab] = useState(0);
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return <>
    <div role="tablist" aria-label="회의록 보기" className="mb-5 flex border-b border-[var(--bi-border)]">
      {['회의록', '전사본 원문'].map((label, index) => <button key={label} ref={el => { refs.current[index] = el; }}
        type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
        aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
          setTab(next); refs.current[next]?.focus();
        }}
        className={`min-h-11 border-b-2 px-4 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)] ${tab === index ? 'border-[var(--bi-accent)] text-[var(--bi-accent)]' : 'border-transparent text-[var(--bi-muted)]'}`}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel-0`} aria-labelledby={`${id}-tab-0`} hidden={tab !== 0} tabIndex={0}>
      <div className="space-y-4">
        <Section title="회의 요약"><p className="whitespace-pre-wrap break-words">{content.summary || '등록된 요약이 없습니다.'}</p></Section>
        <Section title="논의 내용">{content.discussions.length ? <div className="space-y-4">{content.discussions.map((item, i) =>
          <div key={i}><h3 className="font-semibold">{item.title}</h3><p className="whitespace-pre-wrap break-words">{item.text}</p></div>)}</div> : <p>등록된 논의 내용이 없습니다.</p>}</Section>
        {outcomes ?? <MeetingOutcomesView content={content} />}
      </div>
    </div>
    <div role="tabpanel" id={`${id}-panel-1`} aria-labelledby={`${id}-tab-1`} hidden={tab !== 1} tabIndex={0}>
      <Section title="전사본 원문"><p className="whitespace-pre-wrap break-words">{content.transcript?.trim() ? content.transcript : '등록된 전사본 원문이 없습니다.'}</p></Section>
    </div>
  </>;
}

export function MeetingOutcomesView({ content }: { content: Pick<MeetingContent, 'decisions' | 'actionItems'> }) {
  return <div className="space-y-4">
        <Section title="결정 사항">{content.decisions.length ? <ul className="list-disc space-y-2 pl-5">{content.decisions.map((item, i) =>
          <li key={i} className="whitespace-pre-wrap break-words">{item}</li>)}</ul> : <p>등록된 결정 사항이 없습니다.</p>}</Section>
        <Section title="태스크">{content.actionItems.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-[12px]">
          <thead className="bg-[var(--bi-table-header)]"><tr>{['태스크', '담당자', '기한'].map(label => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead>
          <tbody>{content.actionItems.map((item, i) => <tr key={i} className="border-t border-[var(--bi-border)]">
            <td className="whitespace-pre-wrap break-words px-3 py-2">{item.task}</td><td className="px-3 py-2">{item.owner || '미지정'}</td><td className="whitespace-nowrap px-3 py-2">{item.dueDate || '미정'}</td>
          </tr>)}</tbody>
        </table></div> : <p>등록된 태스크가 없습니다.</p>}</Section>
  </div>;
}
