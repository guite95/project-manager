import { NextResponse } from 'next/server';
/** 기존 초대 링크는 계정을 만들거나 로그인 세션을 발급하지 않는다. */
export async function POST() {
  return NextResponse.json({message:'초대 방식은 종료되었습니다. 관리자에게 계정을 발급받으세요.'},{status:410,headers:{'Cache-Control':'private, no-store'}});
}
