import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { isPersonalProject } from '../personal-projects.ts';
import { recordingInput, recordingFileType, type RecordingSummary } from '../recordings.ts';
import { putObject } from './object-storage.mjs';

export async function recordingProject(projectSlug: string) {
  if (projectSlug === 'common' || isPersonalProject(projectSlug)) return null;
  return prisma.flowProject.findUnique({ where: { slug: projectSlug }, select: { slug: true, title: true } });
}
export async function listRecordings(projectSlug: string): Promise<RecordingSummary[]> {
  const rows = await prisma.projectRecording.findMany({ where: { projectSlug }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, title: true, kind: true, context: true, fileName: true, byteLength: true, status: true, error: true, createdAt: true, transcript: { select: { recordingId: true } } } });
  return rows.map(({ transcript, createdAt, kind, status, ...row }) => ({ ...row, kind: kind as RecordingSummary['kind'], status: status as RecordingSummary['status'], createdAt: createdAt.toISOString(), hasTranscript: !!transcript }));
}
export async function createRecording(projectSlug: string, input: Record<string, unknown>, fileName: string, bytes: Buffer, store = putObject) {
  const metadata = recordingInput(input);
  const contentType = recordingFileType(fileName, bytes);
  if (!await recordingProject(projectSlug)) return null;
  const id = crypto.randomUUID();
  const storage = await store(bytes, projectSlug, id, contentType, 'recordings');
  // DB 응답이 불명확하면 원본은 보존한다. 고아 객체는 운영 점검 후 정리한다.
  await prisma.projectRecording.create({ data: { id, projectSlug, ...metadata, fileName, contentType, byteLength: bytes.length, storage: storage as Prisma.InputJsonValue } });
  return { id };
}
export async function getRecording(projectSlug: string, id: string) {
  return prisma.projectRecording.findFirst({ where: { id, projectSlug } });
}
export async function retryRecording(projectSlug: string, id: string) {
  return prisma.$transaction(async tx => {
    const row = await tx.projectRecording.findFirst({ where: { id, projectSlug, status: 'FAILED' }, select: { operation: true } });
    if (!row) return false;
    return (await tx.projectRecording.updateMany({ where: { id, projectSlug, status: 'FAILED', operation: row.operation },
      data: { status: 'PENDING', error: null, operation: row.operation === 'SUBMITTING' ? null : row.operation, leaseToken: null, leaseUntil: null } })).count > 0;
  });
}
export async function claimRecording() {
  return prisma.$transaction(async tx => {
    // 작업자는 여러 개여도 한 번에 하나만 전사 API 작업을 진행한다.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72498103)`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM project_recording
      WHERE (status = 'PENDING' OR (status = 'PROCESSING' AND lease_until < now()))
        AND NOT EXISTS (SELECT 1 FROM project_recording WHERE status = 'PROCESSING' AND lease_until >= now())
      ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!rows[0]) return null;
    const [clock] = await tx.$queryRaw<{ deadline: Date }[]>`SELECT clock_timestamp() + interval '3 minutes' AS deadline`;
    return tx.projectRecording.update({ where: { id: rows[0].id }, data: {
      status: 'PROCESSING', leaseToken: crypto.randomUUID(), leaseUntil: clock.deadline, attempts: { increment: 1 }, error: null,
    } });
  });
}
export async function renewRecording(id: string, leaseToken: string) {
  return await prisma.$executeRaw`UPDATE project_recording SET lease_until = now() + interval '3 minutes', updated_at = now()
    WHERE id = ${id} AND status = 'PROCESSING' AND lease_token = ${leaseToken} AND lease_until > now()` === 1;
}
export async function completeRecording(id: string, leaseToken: string, result: { text: string; language: string; result: unknown }) {
  return prisma.$transaction(async tx => {
    const updated = await tx.$executeRaw`UPDATE project_recording SET status = 'DONE', lease_token = NULL, lease_until = NULL, error = NULL, updated_at = now()
      WHERE id = ${id} AND status = 'PROCESSING' AND lease_token = ${leaseToken} AND lease_until > now()`;
    if (!updated) return false;
    await tx.recordingTranscript.create({ data: { recordingId: id, text: result.text, language: result.language, engine: 'google-speech-v2', model: 'chirp_3', result: result.result as Prisma.InputJsonValue } });
    return true;
  });
}
