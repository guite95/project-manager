import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-types';
import { deleteMaterial } from '@/lib/server/materials-store';

export async function DELETE(request: Request, { params }: {
  params: Promise<{ project: string; material: string }>;
}) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return jsonError('다른 출처의 삭제 요청은 허용하지 않습니다.', 403);
  if (origin) {
    try {
      const source = new URL(origin);
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== (request.headers.get('host') ?? new URL(request.url).host)) return jsonError('다른 출처의 삭제 요청은 허용하지 않습니다.', 403);
    } catch { return jsonError('요청 출처가 올바르지 않습니다.', 403); }
  }
  const { project, material } = await params;
  return await deleteMaterial(project, material)
    ? new NextResponse(null, { status: 204 })
    : jsonError('자료가 없거나 이미 삭제되었습니다.', 404);
}
