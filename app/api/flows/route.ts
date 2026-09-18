import { accessibleCatalog } from '@/lib/access/catalog';
import { NextResponse } from 'next/server';
import { listFlowProjects } from '@/lib/server/flows-store';

export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json((await Promise.all((await accessibleCatalog()).map(project => listFlowProjects(project.slug)))).flat(), {headers:{'Cache-Control':'no-store'}});
}
