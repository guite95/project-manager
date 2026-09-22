import { NextResponse } from 'next/server';
import { jsonBody, requireActor } from '@/lib/access/http';
import { AccessError } from '@/lib/access/store';
import { ProjectRecordsError } from '@/lib/project-records';
import { getProjectRecords, saveProjectRecords } from '@/lib/server/project-records-store';
import { listNotes } from '@/lib/server/notes-store';

type Context = { params: Promise<{ project: string }> };
export const dynamic = 'force-dynamic';
async function respond(action: () => Promise<unknown>) {
  try { return NextResponse.json(await action(), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) {
    const known = error instanceof AccessError || error instanceof ProjectRecordsError;
    return NextResponse.json({ message: known ? error.message : '기록을 처리하지 못했습니다. 다시 시도해 주세요.' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
export async function GET(_request: Request, context: Context) {
  return respond(async () => {
    const actor = await requireActor(), { project } = await context.params;
    const document = await getProjectRecords(actor, project);
    return { document, legacyNotes: await listNotes(project) };
  });
}
export async function PUT(request: Request, context: Context) {
  return respond(async () => {
    const actor = await requireActor(), { project } = await context.params;
    const body = await jsonBody(request);
    return saveProjectRecords(actor, project, body.document, body.expectedRevision as number);
  });
}
