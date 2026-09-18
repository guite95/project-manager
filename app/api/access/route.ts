import { NextResponse } from 'next/server';
import { accessResponse, jsonBody, requireActor, sessionResponse } from '@/lib/access/http';
import { accessOverview, bootstrapOwner, manageAccess } from '@/lib/access/store';
export const dynamic='force-dynamic';
export async function GET() { return accessResponse(async()=>NextResponse.json(await accessOverview(await requireActor()))); }
export async function POST(request: Request) {
  return accessResponse(async()=>{
    const actor=await requireActor(),body=await jsonBody(request);
    if(body.action==='bootstrap') return sessionResponse(await bootstrapOwner(actor,body));
    const result=await manageAccess(actor,body);
    return result?NextResponse.json(result):new NextResponse(null,{status:204});
  });
}
