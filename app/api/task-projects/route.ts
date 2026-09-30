import { NextResponse } from 'next/server';
import { taskResponse } from '@/lib/access/http';
import { listFlowProjectNames } from '@/lib/server/flows-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  return taskResponse(async access => {
    // 숨긴 프로젝트도 이름을 전달해야 기존 오늘 항목과 이력의 이름을 유지한다.
    return NextResponse.json(await listFlowProjectNames(access));
  });
}
