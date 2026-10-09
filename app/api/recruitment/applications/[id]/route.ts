import { NextResponse } from 'next/server';
import { jsonBody } from '@/lib/access/http';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { getApplication, saveApplication } from '@/lib/server/recruitment-applications-store';
import { applicationSaveSchema, parseApplication } from '@/lib/recruitment-applications';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: Context) {
  return recruitmentResponse(async () => {
    const actor = await requireRecruitmentOwner();
    return NextResponse.json(await getApplication(actor.id, (await context.params).id));
  });
}
export async function PUT(request: Request, context: Context) {
  return recruitmentResponse(async () => {
    const actor = await requireRecruitmentOwner();
    const body = parseApplication(applicationSaveSchema, await jsonBody(request));
    return NextResponse.json(await saveApplication(actor.id, (await context.params).id, body.application, body.expectedRevision, body.requestId));
  });
}
