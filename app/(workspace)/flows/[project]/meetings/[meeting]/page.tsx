import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFlowProjectIdentity } from '@/lib/server/flow-catalog-store';
import { getMeeting } from '@/lib/server/meetings-store';
import { meetingsHref } from '@/lib/meetings';
import { MeetingDetail } from '@/components/meetings/meeting-detail';
import { MeetingOutcomes } from '@/components/meetings/meeting-outcomes';

type Props = { params: Promise<{ project: string; meeting: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, meeting } = await params;
  const record = await getMeeting(project, meeting);
  return { title: record ? `${record.title} — 회의록` : '회의록' };
}

export default async function MeetingPage({ params }: Props) {
  const { project: projectSlug, meeting: meetingSlug } = await params;
  const [project, meeting] = await Promise.all([getFlowProjectIdentity(projectSlug), getMeeting(projectSlug, meetingSlug)]);
  if (!project || !meeting) notFound();
  return <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6">
    <Link href={meetingsHref(project.slug)} className="text-[12px] text-[var(--bi-muted)] hover:underline">← {project.title} 회의록 목록</Link>
    <header className="mt-5 mb-6">
      <h1 className="break-words text-[22px] font-bold">{meeting.title}</h1>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
        <div className="flex gap-2"><dt className="text-[var(--bi-muted)]">회의 날짜</dt><dd>{meeting.content.date}</dd></div>
        <div className="flex gap-2"><dt className="shrink-0 text-[var(--bi-muted)]">참석자</dt><dd>{meeting.content.participants.join(', ') || '미등록'}</dd></div>
      </dl>
    </header>
    <MeetingDetail content={meeting.content} outcomes={<MeetingOutcomes key={`${project.slug}/${meeting.slug}/${meeting.revision}`}
      projectSlug={project.slug} initialChart={meeting.chart} initialRevision={meeting.revision} />} />
  </div>;
}
