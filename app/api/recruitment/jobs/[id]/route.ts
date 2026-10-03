import { NextResponse } from 'next/server';
import { jsonBody } from '@/lib/access/http';
import { RecruitmentError } from '@/lib/recruitment';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { deleteRecruitmentJob, getRecruitmentJob } from '@/lib/server/recruitment-jobs-store';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: Context) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const job = await getRecruitmentJob((await context.params).id);
    if (!job) throw new RecruitmentError('공고가 없거나 삭제되었습니다.', 404);
    return NextResponse.json(job);
  });
}
export async function DELETE(request: Request, context: Context) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    await jsonBody(request);
    return NextResponse.json(await deleteRecruitmentJob((await context.params).id));
  });
}
