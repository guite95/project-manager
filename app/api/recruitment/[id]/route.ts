import { NextResponse } from 'next/server';
import { jsonBody } from '@/lib/access/http';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { getRecruitmentDocument, saveRecruitmentDocument } from '@/lib/server/recruitment-store';
import { RecruitmentError } from '@/lib/recruitment';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: Context) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const document = await getRecruitmentDocument((await context.params).id);
    if (!document) throw new RecruitmentError('문서를 찾을 수 없습니다.', 404);
    return NextResponse.json(document);
  });
}
export async function PUT(request: Request, context: Context) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const body = await jsonBody(request);
    return NextResponse.json(await saveRecruitmentDocument((await context.params).id, body.document, body.expectedRevision as number));
  });
}
