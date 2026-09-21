import { createSessionToken, SESSION_MAX_AGE_SECONDS } from '@/lib/session';
import { AccessError, loginAccount } from '@/lib/access/store';
import { accessResponse, jsonBody, sessionResponse } from '@/lib/access/http';
import { getRuntimeSecret } from '@/lib/server/runtime-secrets.mjs';
export async function POST(request: Request) {
  return accessResponse(async()=>{
    const body=await jsonBody(request);
    const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
    if(username.length>64 || typeof body.password!=='string' || !body.password || body.password.length>128) throw new AccessError('계정 또는 비밀번호를 확인하세요.',400);
    const token=await loginAccount(username,body.password);
    if(token) return sessionResponse(token);
    const secret=getRuntimeSecret('SESSION_SECRET');
    if(!secret) throw new AccessError('소유자 등록용 세션 설정이 필요합니다.',503);
    return sessionResponse(await createSessionToken(secret,Date.now()+SESSION_MAX_AGE_SECONDS*1000));
  });
}
