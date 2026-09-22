import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import type { Actor } from '../access/policy.ts';
import { parseProjectRecords, ProjectRecordsError, type ProjectRecords } from '../project-records.ts';

export async function requirePersonalRecordProject(actor: Actor, slug: string) {
  if (actor.role !== 'OWNER') throw new ProjectRecordsError('개인 프로젝트 기록은 소유자만 사용할 수 있습니다.', 403);
  const project = await prisma.flowProject.findUnique({ where: { slug }, select: { scope: true } });
  if (project?.scope !== 'PERSONAL') throw new ProjectRecordsError('개인 프로젝트를 찾을 수 없습니다.', 404);
}
export async function getProjectRecords(actor: Actor, slug: string): Promise<ProjectRecords | null> {
  await requirePersonalRecordProject(actor, slug);
  const row = await prisma.appSetting.findUnique({ where: { key: `project:records:${slug}` } });
  return row ? row.value as unknown as ProjectRecords : null;
}
export async function saveProjectRecords(actor: Actor, slug: string, input: unknown, expectedRevision: number): Promise<ProjectRecords> {
  await requirePersonalRecordProject(actor, slug);
  const document = parseProjectRecords(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new ProjectRecordsError('기록 수정 버전이 필요합니다.');
  const key = `project:records:${slug}`;
  const current = await prisma.appSetting.findUnique({ where: { key } });
  const previous = current?.value as unknown as ProjectRecords | undefined;
  const conflict = () => new ProjectRecordsError('다른 화면에서 기록을 수정했습니다. 작성 내용은 유지됩니다. 내용을 복사한 뒤 최신 기록을 다시 불러와 주세요.', 409);
  if ((previous?.revision ?? 0) !== expectedRevision) throw conflict();
  const saved = { ...document, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
  if (!current) {
    try { await prisma.appSetting.create({ data: { key, value: saved } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict();
      throw error;
    }
  } else {
    const result = await prisma.appSetting.updateMany({ where: { key, value: { equals: current.value as Prisma.InputJsonValue } }, data: { value: saved } });
    if (result.count !== 1) throw conflict();
  }
  return saved;
}
