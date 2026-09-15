"use client";

import Link from 'next/link';
import { useState } from 'react';
import { meetingsHref, type MeetingSummary } from '@/lib/meetings';

export function MeetingList({ projectSlug, meetings }: { projectSlug: string; meetings: MeetingSummary[] }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = meetings.filter(m => `${m.title} ${m.date} ${m.participants.join(' ')}`.toLowerCase().includes(q));
  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-[13px]">전체 회의 <strong>{meetings.length}</strong>건</p>
      <input type="search" aria-label="회의록 검색" placeholder="제목·날짜·참석자 검색" value={query} onChange={e => setQuery(e.target.value)}
        className="h-10 w-full rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-3 text-[12px] outline-[var(--bi-accent)] sm:w-64" />
    </div>
    {meetings.length === 0 ? <div className="rounded-[3px] border border-dashed border-[var(--bi-border)] px-5 py-16 text-center">
      <h2 className="text-[15px] font-semibold">아직 등록된 회의록이 없습니다</h2>
      <p className="mt-2 text-[13px] leading-6 text-[var(--bi-muted)]">회의록을 등록하면 날짜별로 이곳에 모입니다.<br />회의 내용과 전사본 원문을 함께 확인할 수 있습니다.</p>
    </div> : <div className="overflow-x-auto rounded-[3px] border border-[var(--bi-border)]"><table className="w-full min-w-[500px] text-left text-[13px]">
      <thead className="bg-[var(--bi-table-header)] text-[var(--bi-muted)]"><tr>{['회의 날짜', '제목', '참석자'].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
      <tbody>{rows.map(meeting => <tr key={meeting.slug} className="border-t border-[var(--bi-border)] hover:bg-[var(--bi-sidebar-bg)]">
        <td className="whitespace-nowrap px-4 py-4 text-[var(--bi-muted)]">{meeting.date}</td>
        <td className="px-4 py-4"><Link className="font-semibold text-[var(--bi-accent)] hover:underline" href={meetingsHref(projectSlug, meeting.slug)}>{meeting.title}</Link></td>
        <td className="px-4 py-4 text-[var(--bi-muted)]">{meeting.participants.join(', ') || '미등록'}</td>
      </tr>)}{rows.length === 0 ? <tr><td colSpan={3} className="p-10 text-center text-[var(--bi-muted)]">검색 결과가 없습니다.</td></tr> : null}</tbody>
    </table></div>}
  </>;
}
