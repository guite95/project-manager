import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import type { Actor } from '../access/policy.ts';
import { projectInput, ProjectRegistryError, type ProjectScope } from '../project-registry.ts';

function manage(actor: Actor, scope: string) {
  if (actor.bootstrap || !(actor.role === 'OWNER' || actor.role === 'ADMIN' && scope === 'COMPANY'))
    throw new ProjectRegistryError('프로젝트를 관리할 권한이 없습니다.', 403);
}
export async function listManagedProjects(actor: Actor, scope: ProjectScope) {
  manage(actor, scope);
  return prisma.flowProject.findMany({ where: { scope }, orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    select: { slug: true, title: true, scope: true, personalGroup: true, revision: true, showInTasks: true,
      repositories: { select: { workspace: true, path: true }, orderBy: [{ workspace: 'asc' }, { path: 'asc' }] } } });
}
export async function saveManagedProject(actor: Actor, body: Record<string, unknown>, slug?: string) {
  const input = projectInput(body);
  try {
    return await prisma.$transaction(async tx => {
      const current = slug ? await tx.flowProject.findUnique({ where: { slug } }) : null;
      if (slug && !current) throw new ProjectRegistryError('프로젝트를 찾을 수 없습니다.', 404);
      const scope = current?.scope ?? body.scope;
      if (scope !== 'COMPANY' && scope !== 'PERSONAL') throw new ProjectRegistryError('프로젝트 구분을 확인하세요.');
      manage(actor, scope);
      if (current && body.scope !== undefined && body.scope !== current.scope) throw new ProjectRegistryError('프로젝트 소속은 변경할 수 없습니다.');
      let projectSlug = slug;
      if (current) {
        if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new ProjectRegistryError('프로젝트 버전을 확인하세요.');
        const updated = await tx.flowProject.updateMany({ where: { slug, revision: Number(body.revision), scope }, data: { title: input.title, ...(typeof body.showInTasks === 'boolean' ? { showInTasks: body.showInTasks } : {}), revision: { increment: 1 } } });
        if (!updated.count) throw new ProjectRegistryError('다른 화면에서 변경했습니다. 새로고침 후 다시 시도하세요.', 409);
        await tx.projectRepository.deleteMany({ where: { projectSlug: slug } });
      } else {
        const personalGroup = scope === 'PERSONAL' ? body.personalGroup : null;
        if (scope === 'PERSONAL' && !['PORTFOLIO','TOY'].includes(String(personalGroup))) throw new ProjectRegistryError('프로젝트 분류를 선택하세요.');
        projectSlug = `${scope === 'PERSONAL' ? 'personal' : 'project'}-${randomUUID()}`;
        const last = await tx.flowProject.aggregate({ _max: { position: true } });
        await tx.flowProject.create({ data: { slug: projectSlug, title: input.title, scope, personalGroup: personalGroup as string | null, showInTasks: typeof body.showInTasks === 'boolean' ? body.showInTasks : true, position: (last._max.position ?? -1) + 1 } });
      }
      await tx.projectRepository.createMany({ data: input.repositories.map(row => ({ ...row, projectSlug: projectSlug! })) });
      await tx.accessAudit.create({ data: { id: randomUUID(), actorId: actor.id, action: current ? 'PROJECT_UPDATED' : 'PROJECT_CREATED', target: projectSlug! } });
      return tx.flowProject.findUniqueOrThrow({ where: { slug: projectSlug }, include: { repositories: true } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ProjectRegistryError('이미 다른 프로젝트에 연결된 저장소입니다.', 409);
    throw error;
  }
}

/** 목록의 체크는 표시 여부만 갱신하고 이름과 저장소 연결은 덮어쓰지 않는다. */
export async function setProjectTaskVisibility(actor: Actor, slug: string, showInTasks: unknown, revision: unknown) {
  if (typeof showInTasks !== 'boolean' || !Number.isSafeInteger(revision) || Number(revision) < 0) throw new ProjectRegistryError('표시 여부와 프로젝트 버전을 확인하세요.');
  return prisma.$transaction(async tx => {
    const current = await tx.flowProject.findUnique({ where: { slug } });
    if (!current) throw new ProjectRegistryError('프로젝트를 찾을 수 없습니다.', 404);
    manage(actor, current.scope);
    const updated = await tx.flowProject.updateMany({ where: { slug, revision: Number(revision) }, data: { showInTasks, revision: { increment: 1 } } });
    if (!updated.count) throw new ProjectRegistryError('다른 화면에서 변경했습니다. 새로고침 후 다시 시도하세요.', 409);
    await tx.accessAudit.create({ data: { id: randomUUID(), actorId: actor.id, action: 'PROJECT_TASK_VISIBILITY_UPDATED', target: slug } });
    return tx.flowProject.findUniqueOrThrow({ where: { slug }, include: { repositories: true } });
  });
}
