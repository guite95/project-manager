import { NextResponse } from 'next/server';
import { requireActor, sameOrigin } from '../access/http.ts';
import { canProject, type Action } from '../access/policy.ts';
import { AccessError } from '../access/store.ts';
import { MAX_RECORDING_BYTES } from '../recordings.ts';
import { recordingProject } from './recordings-store.ts';

export async function requireRecordingProject(project: string, action: Action, request?: Request) {
  const actor = await requireActor();
  if (!canProject(actor, project, action)) throw new AccessError('프로젝트 접근 권한이 없습니다.', 403);
  if (action !== 'read' && (!request || !sameOrigin(request))) throw new AccessError('다른 출처의 요청은 허용하지 않습니다.', 403);
  if (!await recordingProject(project)) throw new AccessError('프로젝트가 없습니다.', 404);
}
export async function recordingResponse(action: () => Promise<Response>) {
  try { const response = await action(); response.headers.set('Cache-Control', 'private, no-store'); return response; }
  catch (error) {
    return NextResponse.json({ message: error instanceof AccessError ? error.message : '녹음 요청을 처리하지 못했습니다. 저장소와 전사 설정을 확인해 주세요.' },
      { status: error instanceof AccessError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
export async function recordingForm(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new AccessError('녹음 파일 업로드 요청이 필요합니다.', 415);
  const limit = MAX_RECORDING_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new AccessError('녹음은 최대 100MB까지 올릴 수 있습니다.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError('녹음 파일이 없습니다.');
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); throw new AccessError('녹음은 최대 100MB까지 올릴 수 있습니다.', 413); }
      chunks.push(new Uint8Array(value));
    }
    return await new Response(new Blob(chunks), { headers: { 'Content-Type': contentType } }).formData();
  } catch (error) { if (error instanceof AccessError) throw error; throw new AccessError('파일 업로드 요청을 읽지 못했습니다.'); }
  finally { reader.releaseLock(); }
}
export function recordingDownload(bytes: Uint8Array, name: string, contentType: string) {
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': contentType, 'Content-Length': String(bytes.length),
    'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
  } });
}
