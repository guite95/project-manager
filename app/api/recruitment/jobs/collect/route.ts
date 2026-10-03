import { NextResponse } from 'next/server';
import { jsonBody } from '@/lib/access/http';
import { RecruitmentError } from '@/lib/recruitment';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { getJobCollectionStatus, requestJobCollection } from '@/lib/server/recruitment-jobs-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    return NextResponse.json(await getJobCollectionStatus());
  });
}
export async function POST(request: Request) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const body = await jsonBody(request);
    if (Object.keys(body).length) throw new RecruitmentError('수집 설정은 워커에서 관리합니다.');
    return NextResponse.json(await requestJobCollection(), { status: 202 });
  });
}
