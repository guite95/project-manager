import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFlowProjectIdentity } from '@/lib/server/flow-catalog-store';
import { listMeetings } from '@/lib/server/meetings-store';
import { MeetingList } from '@/components/meetings/meeting-list';

type Props = { params: Promise<{ project: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getFlowProjectIdentity((await params).project);
  return { title: project ? `회의록 — ${project.title} — 프로젝트 매니지먼트` : '회의록' };
}

export default async function MeetingsPage({ params }: Props) {
  const project = await getFlowProjectIdentity((await params).project);
  if (!project) notFound();
  const meetings = await listMeetings(project.slug);
  return <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6">
    <header className="mb-6 border-b border-[var(--bi-border)] pb-5">
      <p className="mb-2 text-[12px] text-[var(--bi-muted)]">{project.title}</p>
      <h1 className="text-[22px] font-bold">회의록</h1>
      <p className="mt-2 text-[13px] text-[var(--bi-muted)]">회의에서 나눈 이야기와 결정 사항, 태스크를 확인합니다.</p>
    </header>
    <MeetingList projectSlug={project.slug} meetings={meetings} />
  </div>;
}
