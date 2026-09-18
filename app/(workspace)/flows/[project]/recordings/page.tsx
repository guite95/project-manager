import { notFound } from 'next/navigation';
import { requireActor } from '@/lib/access/http';
import { canProject } from '@/lib/access/policy';
import { recordingProject, listRecordings } from '@/lib/server/recordings-store';
import { RecordingLibrary } from '@/components/recordings/recording-library';
export const metadata = { title: '녹음·전사 — 프로젝트 매니지먼트' };
export default async function RecordingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const actor = await requireActor();
  if (!canProject(actor, project, 'read')) notFound();
  const identity = await recordingProject(project);
  if (!identity) notFound();
  return <RecordingLibrary key={project} project={project} projectTitle={identity.title} initial={await listRecordings(project)} />;
}
