import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonBody } from '@/lib/access/http';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { saveApplicationTask } from '@/lib/server/recruitment-applications-store';
import { applicationTaskSchema, parseApplication, requestIdSchema } from '@/lib/recruitment-applications';
const schema = z.strictObject({ task: applicationTaskSchema, expectedRevision: z.number().int().positive(), requestId: requestIdSchema });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return recruitmentResponse(async () => {
    const actor = await requireRecruitmentOwner();
    const body = parseApplication(schema, await jsonBody(request));
    return NextResponse.json(await saveApplicationTask(actor.id, (await context.params).id, body.task, body.expectedRevision, body.requestId));
  });
}
