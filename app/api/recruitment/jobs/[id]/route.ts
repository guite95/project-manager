import { NextResponse } from 'next/server';
import { jsonBody } from '@/lib/access/http';
import { RecruitmentError } from '@/lib/recruitment';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { completeRecruitmentJobCoverLetter, deleteRecruitmentJob, getRecruitmentJob } from '@/lib/server/recruitment-jobs-store';

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
export async function PATCH(request: Request, context: Context) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const body = await jsonBody(request);
    if (Object.keys(body).length !== 1 || body.userState !== 'COVER_LETTER_WRITTEN') {
      throw new RecruitmentError('자소서 작성 완료 상태를 확인해 주세요.');
    }
    const result = await completeRecruitmentJobCoverLetter((await context.params).id);
    if (!result) throw new RecruitmentError('공고가 없거나 삭제되었습니다.', 404);
    return NextResponse.json(result);
  });
}
