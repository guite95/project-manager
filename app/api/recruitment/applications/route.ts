import { NextResponse } from 'next/server';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { listApplications } from '@/lib/server/recruitment-applications-store';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return recruitmentResponse(async () => {
    const actor = await requireRecruitmentOwner();
    const query = new URL(request.url).searchParams;
    return NextResponse.json(await listApplications(actor.id, { query: query.get('q') ?? '', status: query.get('status') ?? '' }));
  });
}
