import { NextResponse } from 'next/server';
import { jsonBody } from '@/lib/access/http';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { getPublicPortfolio, savePublicPortfolio } from '@/lib/server/public-portfolio-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    return NextResponse.json(await getPublicPortfolio());
  });
}
export async function PUT(request: Request) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const body = await jsonBody(request);
    return NextResponse.json(await savePublicPortfolio(body.portfolio, body.expectedRevision as number));
  });
}
