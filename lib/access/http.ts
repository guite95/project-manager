import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { cache } from 'react';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../session.ts';
import { AccessError, resolveActor } from './store.ts';
export const currentActor = cache(async () => resolveActor((await cookies()).get(SESSION_COOKIE_NAME)?.value??''));
export async function requireActor() {
  const actor=await currentActor();
  if(!actor) throw new AccessError('로그인이 필요합니다.',401);
  return actor;
}
export function sessionResponse(token: string) {
  const response=new NextResponse(null,{status:204});
  response.cookies.set({name:SESSION_COOKIE_NAME,value:token,httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:SESSION_MAX_AGE_SECONDS});
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export function sameOrigin(request: Request): boolean {
  const origin=request.headers.get('origin');
  if(!origin) return false;
  try {
    const url=new URL(origin);
    return ['https:','http:'].includes(url.protocol) && url.host===(request.headers.get('host')??new URL(request.url).host);
  } catch { return false; }
}
export async function jsonBody(request: Request): Promise<Record<string,unknown>> {
  if(!sameOrigin(request)) throw new AccessError('다른 출처의 요청은 허용하지 않습니다.',403);
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new AccessError('JSON 본문이 필요합니다.',415);
  const text=await request.text();
  if(text.length>100_000) throw new AccessError('요청이 너무 큽니다.',413);
  try {
    const body=JSON.parse(text);
    if(!body || typeof body!=='object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AccessError('요청 본문을 확인하세요.'); }
}
export async function accessResponse(action:()=>Promise<Response>) {
  try { const response=await action();response.headers.set('Cache-Control','private, no-store');return response; }
  catch(error) {
    const known=error instanceof AccessError;
    const conflict=Boolean(error && typeof error==='object' && 'code' in error && error.code==='P2002');
    return NextResponse.json({message:known?error.message:conflict?'이미 등록된 계정 또는 권한입니다.':'요청을 처리하지 못했습니다. 계정 저장소 설정을 확인하세요.'},{status:known?error.status:conflict?409:503,headers:{'Cache-Control':'private, no-store'}});
  }
}
