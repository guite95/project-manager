import { NextResponse } from 'next/server';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { listApplicationTasks } from '@/lib/server/recruitment-applications-store';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return recruitmentResponse(async () => {
    const actor = await requireRecruitmentOwner();
    return NextResponse.json(await listApplicationTasks(actor.id, new URL(request.url).searchParams.get('applicationId') ?? undefined));
  });
}
