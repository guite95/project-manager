import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { parseRecruitmentDocument, recruitmentKey, RecruitmentError, type RecruitmentDocument, type RecruitmentKind, type RecruitmentSummary } from '../recruitment.ts';

export async function listRecruitmentDocuments(kind: RecruitmentKind): Promise<RecruitmentSummary[]> {
  // 목록은 본문을 내려받지 않는다. 상세 선택 시에만 전체 문서를 읽는다.
  const rows = await prisma.$queryRaw<{ value: RecruitmentSummary }[]>`
    SELECT value - 'sections' - 'sourceUrls' AS value FROM app_setting
    WHERE key LIKE 'recruitment:document:%' AND value->>'kind' = ${kind}
    ORDER BY value->>'project', value->>'title', key`;
  return rows.map(row => row.value);
}
export async function getRecruitmentDocument(id: string): Promise<RecruitmentDocument | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: recruitmentKey(id) } });
  return row ? row.value as unknown as RecruitmentDocument : null;
}
export async function saveRecruitmentDocument(id: string, input: unknown, expectedRevision: number): Promise<RecruitmentDocument> {
  const key = recruitmentKey(id);
  const document = parseRecruitmentDocument(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new RecruitmentError('문서 수정 버전이 필요합니다.');
  const current = await prisma.appSetting.findUnique({ where: { key } });
  const previous = current?.value as unknown as RecruitmentDocument | undefined;
  if ((previous?.revision ?? 0) !== expectedRevision) throw new RecruitmentError('다른 화면에서 문서를 수정했습니다. 작성 중인 내용을 복사한 뒤 최신 문서를 다시 열어 주세요.', 409);
  if (previous && previous.kind !== document.kind) throw new RecruitmentError('문서 종류는 변경할 수 없습니다.');
  const saved = { ...document, id, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
  if (!current) {
    try { await prisma.appSetting.create({ data: { key, value: saved } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new RecruitmentError('이미 생성된 문서입니다. 목록을 다시 확인하세요.', 409);
      throw error;
    }
  } else {
    const result = await prisma.appSetting.updateMany({ where: { key, value: { equals: current.value as Prisma.InputJsonValue } }, data: { value: saved } });
    if (result.count !== 1) throw new RecruitmentError('다른 화면에서 문서를 수정했습니다. 작성 중인 내용을 복사한 뒤 최신 문서를 다시 열어 주세요.', 409);
  }
  return saved;
}
