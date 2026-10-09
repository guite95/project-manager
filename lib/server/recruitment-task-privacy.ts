import type { Prisma } from '@prisma/client';

export const careerTaskKey = (id: string) => `recruitment:private-task:${id}`;

/** 연결 해제 후에도 분류를 남겨 프로젝트 이동·CLI 노출로 개인 자료가 유출되지 않게 한다. */
export async function privateCareerTaskIds(db: Pick<Prisma.TransactionClient, 'appSetting'>, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.appSetting.findMany({ where: { key: { in: ids.map(careerTaskKey) } }, select: { key: true } });
  return new Set(rows.map(row => row.key.slice('recruitment:private-task:'.length)));
}
