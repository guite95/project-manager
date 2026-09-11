import { NextResponse } from 'next/server';
import { jsonError, readJson } from '@/lib/api-types';
import { FlowDocumentError } from '@/lib/flows/document';
import { getFlowDocument, updateFlowDocument } from '@/lib/server/flows-store';

export const dynamic = 'force-dynamic';
type Context = {params:Promise<{project:string;chart:string}>};
export async function GET(_request: Request, {params}: Context) {
  const {project,chart} = await params;
  const row = await getFlowDocument(project,chart);
  return row ? NextResponse.json(row,{headers:{'Cache-Control':'no-store'}}) : jsonError('차트가 없습니다.',404);
}
export async function PUT(request: Request, {params}: Context) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return jsonError('application/json 본문이 필요합니다.',415);
  const origin = request.headers.get('origin');
  // Nginx terminates/forwards HTTPS; the internal Request URL can be HTTP.
  // Use the original Host header, not a caller-supplied forwarded host.
  if(origin) {
    try {
      const source = new URL(origin);
      if(!['http:','https:'].includes(source.protocol) || source.host !== (request.headers.get('host') ?? new URL(request.url).host)) return jsonError('다른 출처의 저장 요청은 허용하지 않습니다.',403);
    } catch {return jsonError('요청 출처가 올바르지 않습니다.',403);}
  }
  const {project,chart} = await params;
  const body = await readJson(request);
  try {
    const result = await updateFlowDocument(project,chart,body.chart,body.revision as number);
    if(result.status==='missing') return jsonError('차트가 없습니다.',404);
    if(result.status==='conflict') return jsonError('다른 곳에서 수정되었습니다. 최신 JSON을 다시 불러오세요.',409);
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    if(error instanceof FlowDocumentError) return jsonError(error.message,400);
    throw error;
  }
}
