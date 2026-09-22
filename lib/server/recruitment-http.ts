import { NextResponse } from 'next/server';
import { requireActor } from '../access/http.ts';
import { AccessError } from '../access/store.ts';
import { RecruitmentError } from '../recruitment.ts';

export async function requireRecruitmentOwner() {
  const actor = await requireActor();
  if (actor.role !== 'OWNER') throw new AccessError('채용 자료는 소유자만 사용할 수 있습니다.', 403);
}
export async function recruitmentResponse(action: () => Promise<Response>) {
  try {
    const response = await action();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    const known = error instanceof AccessError || error instanceof RecruitmentError;
    return NextResponse.json({ message: known ? error.message : '문서를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
