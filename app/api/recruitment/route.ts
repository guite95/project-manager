import { NextResponse } from 'next/server';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { listRecruitmentDocuments } from '@/lib/server/recruitment-store';
import { RecruitmentError } from '@/lib/recruitment';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return recruitmentResponse(async () => {
    await requireRecruitmentOwner();
    const kind = new URL(request.url).searchParams.get('kind');
    if (kind !== 'EXPERIENCE' && kind !== 'COVER_LETTER') throw new RecruitmentError('문서 종류가 필요합니다.');
    return NextResponse.json(await listRecruitmentDocuments(kind));
  });
}
