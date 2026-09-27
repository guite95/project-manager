import { NextResponse } from 'next/server';
import { jsonBody } from '@/lib/access/http';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { getRecruitmentCredentials, saveRecruitmentCredentials } from '@/lib/server/recruitment-credentials-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    return NextResponse.json(await getRecruitmentCredentials());
  });
}
export async function PUT(request: Request) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const body = await jsonBody(request);
    return NextResponse.json(await saveRecruitmentCredentials(body.items, body.expectedRevision as number));
  });
}
