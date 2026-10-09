import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonBody } from '@/lib/access/http';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { restoreApplication } from '@/lib/server/recruitment-applications-store';
import { parseApplication, requestIdSchema } from '@/lib/recruitment-applications';
const schema = z.strictObject({ revision: z.number().int().positive(), expectedRevision: z.number().int().positive(), requestId: requestIdSchema });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return recruitmentResponse(async () => {
    const actor = await requireRecruitmentOwner();
    const body = parseApplication(schema, await jsonBody(request));
    return NextResponse.json(await restoreApplication(actor.id, (await context.params).id, body.revision, body.expectedRevision, body.requestId));
  });
}
