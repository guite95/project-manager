import { NextResponse } from 'next/server';
import { requireActor, jsonBody, accessResponse } from '@/lib/access/http';
import { listManagedProjects, saveManagedProject } from '@/lib/server/project-registry-store';
import { ProjectRegistryError } from '@/lib/project-registry';

async function response(action: () => Promise<unknown>) {
  return accessResponse(async () => {
    try { return NextResponse.json(await action(), { headers: { 'Cache-Control': 'private, no-store' } }); }
    catch (error) {
      if (error instanceof ProjectRegistryError) return NextResponse.json({ message: error.message }, { status: error.status });
      throw error;
    }
  });
}
export async function GET(request: Request) {
  return response(async () => {
    const actor = await requireActor();
    const scope = new URL(request.url).searchParams.get('scope');
    if (scope !== 'COMPANY' && scope !== 'PERSONAL') throw new ProjectRegistryError('프로젝트 구분을 확인하세요.');
    return listManagedProjects(actor, scope);
  });
}
export async function POST(request: Request) {
  return response(async () => saveManagedProject(await requireActor(), await jsonBody(request)));
}
export async function PATCH(request: Request) {
  return response(async () => {
    const actor = await requireActor();
    const body = await jsonBody(request);
    if (typeof body.slug !== 'string' || !body.slug) throw new ProjectRegistryError('프로젝트를 선택하세요.');
    return saveManagedProject(actor, body, body.slug);
  });
}
