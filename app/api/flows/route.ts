import { NextResponse } from 'next/server';
import { listFlowProjects } from '@/lib/server/flows-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json(await listFlowProjects(), {headers:{'Cache-Control':'no-store'}});
}
