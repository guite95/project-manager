import type { Prisma } from '@prisma/client';
import { isAdmin, type Actor } from '../access/policy.ts';
import { AccessError } from '../access/store.ts';
import { prisma } from '../db.ts';
import { PERSONAL_ISSUES_SLUG } from '../today-board.ts';

export type TaskAccess = { hiddenProjectSlugs: string[] };

/** 할 일에서는 명시적인 개인 프로젝트 멤버십도 개인 이슈를 공개하지 않는다. */
export async function loadTaskAccess(actor: Actor): Promise<TaskAccess> {
  if (!isAdmin(actor)) throw new AccessError('할 일은 소유자와 관리자만 사용할 수 있습니다.', 403);
  if (actor.role === 'OWNER') return { hiddenProjectSlugs: [] };
  const personal = await prisma.flowProject.findMany({ where: { scope: 'PERSONAL' }, select: { slug: true } });
  return { hiddenProjectSlugs: [PERSONAL_ISSUES_SLUG, ...personal.map(project => project.slug)] };
}

export function taskProjectFilter(access?: TaskAccess): Prisma.StringFilter | undefined {
  return access?.hiddenProjectSlugs.length ? { notIn: access.hiddenProjectSlugs } : undefined;
}

export function assertTaskProject(projectSlug: string, access?: TaskAccess): void {
  if (access?.hiddenProjectSlugs.includes(projectSlug)) throw new AccessError('개인 이슈에 접근할 권한이 없습니다.', 403);
}

export async function assertTaskIssues(ids: string[], access: TaskAccess | undefined, db: Pick<Prisma.TransactionClient, 'issue'> = prisma): Promise<void> {
  if (!access?.hiddenProjectSlugs.length) return;
  const rows = await db.issue.findMany({ where: { id: { in: ids } }, select: { projectSlug: true } });
  for (const row of rows) assertTaskProject(row.projectSlug, access);
}

export function visibleTaskSlugs(slugs: string[], access?: TaskAccess): string[] {
  return slugs.filter(slug => !access?.hiddenProjectSlugs.includes(slug));
}

/** 숨긴 프로젝트의 위치를 유지하면서 관리자에게 보이는 순서만 바꾼다. */
export function mergeTaskSlugs(current: string[], incoming: string[], access: TaskAccess): string[] {
  const visible = visibleTaskSlugs(incoming, access);
  let index = 0;
  const merged = current.flatMap(slug => {
    if (access.hiddenProjectSlugs.includes(slug)) return [slug];
    const next = visible[index++];
    return next === undefined ? [] : [next];
  });
  return [...merged, ...visible.slice(index)];
}
