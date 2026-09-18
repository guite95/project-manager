import { NextResponse } from 'next/server';
import { AccessError } from '@/lib/access/store';
import { prisma } from '@/lib/db';
import { readObject } from '@/lib/server/object-storage.mjs';
import { getRecording, retryRecording } from '@/lib/server/recordings-store';
import { recordingResponse, recordingDownload, requireRecordingProject } from '@/lib/server/recording-http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ project: string; recording: string; action: string }> };
export async function GET(_request: Request, { params }: Context) {
  return recordingResponse(async () => {
    const { project, recording, action } = await params;
    await requireRecordingProject(project, 'read');
    const row = await getRecording(project, recording);
    if (!row) throw new AccessError('녹음이 없습니다.', 404);
    if (action === 'audio') return recordingDownload(await readObject(row.storage, project, row.id, 'recordings'), row.fileName, row.contentType);
    if (!['transcript', 'text'].includes(action)) throw new AccessError('지원하지 않는 요청입니다.', 404);
    const transcript = await prisma.recordingTranscript.findUnique({ where: { recordingId: row.id }, select: { text: true, createdAt: true } });
    if (!transcript) throw new AccessError('아직 전사본이 생성되지 않았습니다.', 404);
    if (action === 'text') return NextResponse.json(transcript);
    return recordingDownload(Buffer.from(transcript.text, 'utf8'), `${row.fileName.replace(/\.[^.]+$/, '')}-전사본.txt`, 'text/plain; charset=utf-8');
  });
}
export async function POST(request: Request, { params }: Context) {
  return recordingResponse(async () => {
    const { project, recording, action } = await params;
    await requireRecordingProject(project, 'write', request);
    if (action !== 'retry') throw new AccessError('지원하지 않는 요청입니다.', 404);
    if (!await getRecording(project, recording)) throw new AccessError('녹음이 없습니다.', 404);
    if (!await retryRecording(project, recording)) throw new AccessError('실패한 전사만 재시도할 수 있습니다.', 409);
    return NextResponse.json({ ok: true });
  });
}
