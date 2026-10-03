import { NextResponse } from 'next/server';
import { parseJobQuery } from '@/lib/recruitment-jobs';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { listRecruitmentJobs } from '@/lib/server/recruitment-jobs-store';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    return NextResponse.json(await listRecruitmentJobs(parseJobQuery(new URL(request.url).searchParams)));
  });
}
