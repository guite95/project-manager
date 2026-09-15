import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-types';
import { MAX_MATERIAL_BYTES, validateMaterial, type MaterialContent } from '@/lib/materials';
import { createMaterial } from '@/lib/server/materials-store';
import { getFlowProjectIdentity } from '@/lib/server/flow-catalog-store';

export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ project: string }> }) {
  // multipart POST도 외부 사이트에서 보낼 수 있으므로 저장 전에 출처를 검사한다.
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return jsonError('다른 출처의 저장 요청은 허용하지 않습니다.', 403);
  if (origin) {
    try {
      const source = new URL(origin);
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== (request.headers.get('host') ?? new URL(request.url).host)) return jsonError('다른 출처의 저장 요청은 허용하지 않습니다.', 403);
    } catch { return jsonError('요청 출처가 올바르지 않습니다.', 403); }
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) return jsonError('파일 업로드 요청이 필요합니다.', 415);
  const { project } = await params;
  if (project === 'common' || !await getFlowProjectIdentity(project)) return jsonError('프로젝트가 없습니다.', 404);
  // Content-Length가 없는 청크 요청도 읽는 도중 상한을 적용한다.
  const maxBody = MAX_MATERIAL_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length')) > maxBody) return jsonError('파일은 최대 10MB까지 추가할 수 있습니다.', 413);
  let form: FormData;
  const reader = request.body?.getReader();
  if (!reader) return jsonError('파일이 없습니다.', 400);
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBody) { await reader.cancel(); return jsonError('파일은 최대 10MB까지 추가할 수 있습니다.', 413); }
      chunks.push(new Uint8Array(value));
    }
    form = await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
  } catch { return jsonError('파일 업로드 요청을 읽을 수 없습니다.', 400); }
  finally { reader.releaseLock(); }
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return jsonError('PDF 또는 HTML 파일을 선택해 주세요.', 400);
  if (file.size > MAX_MATERIAL_BYTES) return jsonError('파일은 최대 10MB까지 추가할 수 있습니다.', 413);
  const format = /\.pdf$/i.test(file.name) ? 'pdf' : /\.html?$/i.test(file.name) ? 'html' : null;
  if (!format) return jsonError('PDF 또는 HTML 파일만 추가할 수 있습니다.', 415);
  const title = form.get('title');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) return jsonError('자료 제목은 1~200자로 입력해 주세요.', 400);
  const content: MaterialContent = { kind: 'material', format, fileName: file.name, byteLength: file.size, data: Buffer.from(await file.arrayBuffer()).toString('base64') };
  try { validateMaterial(content); }
  catch (error) { return jsonError((error as Error).message, 400); }
  const result = await createMaterial(project, title, content);
  return result ? NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } }) : jsonError('프로젝트가 없습니다.', 404);
}
