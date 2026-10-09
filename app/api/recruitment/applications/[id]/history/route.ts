import { NextResponse } from 'next/server';
import { recruitmentResponse, requireRecruitmentOwner } from '@/lib/server/recruitment-http';
import { listApplicationHistory } from '@/lib/server/recruitment-applications-store';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return recruitmentResponse(async () => {
    const actor = await requireRecruitmentOwner();
    return NextResponse.json(await listApplicationHistory(actor.id, (await context.params).id));
  });
}
