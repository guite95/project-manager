import { NextResponse } from 'next/server';
import { accessResponse, requireActor } from '@/lib/access/http';
import { AccessError } from '@/lib/access/store';
import { listFlowProjectNames } from '@/lib/server/flows-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  return accessResponse(async () => {
    const actor = await requireActor();
    if (actor.role !== 'OWNER') throw new AccessError('할 일은 소유자만 사용할 수 있습니다.', 403);
    // 숨긴 프로젝트도 이름을 전달해야 기존 오늘 항목과 이력의 이름을 유지한다.
    return NextResponse.json(await listFlowProjectNames());
  });
}
