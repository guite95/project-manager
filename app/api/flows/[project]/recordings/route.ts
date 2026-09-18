import { NextResponse } from 'next/server';
import { AccessError } from '@/lib/access/store';
import { recordingInput, recordingFileType } from '@/lib/recordings';
import { storageConfig } from '@/lib/server/object-storage.mjs';
import { speechConfig } from '@/lib/server/chirp-transcription.mjs';
import { createRecording, listRecordings } from '@/lib/server/recordings-store';
import { recordingResponse, recordingForm, requireRecordingProject } from '@/lib/server/recording-http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ project: string }> };
export async function GET(_request: Request, { params }: Context) {
  return recordingResponse(async () => {
    const { project } = await params;
    await requireRecordingProject(project, 'read');
    return NextResponse.json(await listRecordings(project));
  });
}
export async function POST(request: Request, { params }: Context) {
  return recordingResponse(async () => {
    const { project } = await params;
    await requireRecordingProject(project, 'write', request);
    try { if (!storageConfig()) throw new Error(); speechConfig(); }
    catch { throw new AccessError('녹음 저장소와 Google 전사 설정을 먼저 완료해 주세요.', 503); }
    const form = await recordingForm(request);
    const file = form.get('file');
    if (!(file instanceof File)) throw new AccessError('녹음 파일을 선택해 주세요.');
    const bytes = Buffer.from(await file.arrayBuffer());
    let input;
    try { input = recordingInput({ title: form.get('title'), kind: form.get('kind'), context: form.get('context') ?? '' }); recordingFileType(file.name, bytes); }
    catch (error) { throw new AccessError((error as Error).message); }
    const result = await createRecording(project, input, file.name, bytes);
    if (!result) throw new AccessError('프로젝트가 없습니다.', 404);
    return NextResponse.json(result, { status: 201 });
  });
}
