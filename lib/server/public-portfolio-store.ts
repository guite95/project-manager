import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { RecruitmentError } from '../recruitment.ts';
import { parsePublicPortfolio, publicPortfolioKey, type PublicPortfolio, type PublicPortfolioContent } from '../public-portfolio.ts';

export async function getPublicPortfolio(): Promise<PublicPortfolio | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: publicPortfolioKey }, select: { value: true } });
  if (!row) return null;
  const value = row.value as unknown as PublicPortfolio;
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new RecruitmentError('공개 포트폴리오 저장 상태를 확인하세요.', 503);
  return { ...parsePublicPortfolio(value), revision: value.revision, updatedAt: value.updatedAt };
}
export async function getPublishedPortfolio(): Promise<PublicPortfolioContent | null> {
  const portfolio = await getPublicPortfolio();
  return portfolio?.published ? portfolio.content : null;
}
export async function savePublicPortfolio(input: unknown, expectedRevision: number): Promise<PublicPortfolio> {
  const parsed = parsePublicPortfolio(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new RecruitmentError('수정 버전이 필요합니다.');
  const current = await prisma.appSetting.findUnique({ where: { key: publicPortfolioKey } });
  const previous = current?.value as unknown as PublicPortfolio | undefined;
  const conflict = () => new RecruitmentError('다른 화면에서 공개 포트폴리오를 수정했습니다. 작성 내용은 유지됩니다. 내용을 복사한 뒤 최신 정보를 다시 불러오세요.', 409);
  if ((previous?.revision ?? 0) !== expectedRevision) throw conflict();
  const saved = { ...parsed, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
  if (!current) {
    try { await prisma.appSetting.create({ data: { key: publicPortfolioKey, value: saved } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict();
      throw error;
    }
  } else {
    const result = await prisma.appSetting.updateMany({ where: { key: publicPortfolioKey, value: { equals: current.value as Prisma.InputJsonValue } }, data: { value: saved } });
    if (result.count !== 1) throw conflict();
  }
  return saved;
}
