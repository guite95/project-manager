import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { RecruitmentError } from '../recruitment.ts';
import { credentialsKey, parseRecruitmentCredentials, type RecruitmentCredentials } from '../recruitment-credentials.ts';

export async function getRecruitmentCredentials(): Promise<RecruitmentCredentials> {
  const row = await prisma.appSetting.findUnique({ where: { key: credentialsKey } });
  return row ? row.value as unknown as RecruitmentCredentials : { items: [], revision: 0, updatedAt: null };
}

export async function saveRecruitmentCredentials(input: unknown, expectedRevision: number): Promise<RecruitmentCredentials> {
  const items = parseRecruitmentCredentials(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new RecruitmentError('수정 버전이 필요합니다.');
  const current = await prisma.appSetting.findUnique({ where: { key: credentialsKey } });
  const previous = current?.value as unknown as RecruitmentCredentials | undefined;
  if ((previous?.revision ?? 0) !== expectedRevision) throw new RecruitmentError('다른 화면에서 지원용 정보를 수정했습니다. 작성 내용을 복사한 뒤 최신 정보를 다시 열어 주세요.', 409);
  const saved = { items, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
  if (!current) {
    try { await prisma.appSetting.create({ data: { key: credentialsKey, value: saved } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new RecruitmentError('다른 화면에서 지원용 정보를 저장했습니다. 최신 정보를 확인하세요.', 409);
      throw error;
    }
  } else {
    const result = await prisma.appSetting.updateMany({ where: { key: credentialsKey, value: { equals: current.value as Prisma.InputJsonValue } }, data: { value: saved } });
    if (result.count !== 1) throw new RecruitmentError('다른 화면에서 지원용 정보를 수정했습니다. 작성 내용은 유지됩니다.', 409);
  }
  return saved;
}
