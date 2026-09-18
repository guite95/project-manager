import { accessResponse, jsonBody, requireActor, sessionResponse } from '@/lib/access/http';
import { changePassword } from '@/lib/access/store';
export async function POST(request: Request) { return accessResponse(async()=>{
  const body=await jsonBody(request);
  return sessionResponse(await changePassword(await requireActor(),body.currentPassword,body.password));
}); }
