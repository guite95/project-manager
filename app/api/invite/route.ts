import { accessResponse, jsonBody, sessionResponse } from '@/lib/access/http';
import { acceptInvite } from '@/lib/access/store';
export async function POST(request: Request) { return accessResponse(async()=>{
  const body=await jsonBody(request);
  return sessionResponse(await acceptInvite(String(body.token??''),body.password));
}); }
