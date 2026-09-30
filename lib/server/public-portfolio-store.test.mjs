import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from './test-db.mjs';
import { publicPortfolioKey } from '../public-portfolio.ts';
import { getPublicPortfolio, getPublishedPortfolio, savePublicPortfolio } from './public-portfolio-store.ts';

const input = () => ({ published: true, content: { name: '테스트', headline: '테스트 개발자', introduction: ['공개 소개'], links: [], strengths: [], skills: [], projects: [], activities: [] } });
const privateKey = 'recruitment:document:test-public-isolation';
after(async () => { await prisma.appSetting.deleteMany({ where: { key: { in: [publicPortfolioKey, privateKey] } } }); await prisma.$disconnect(); });
test('공개 조회는 읽기 전용이며 별도 본문만 제공하고 비공개 전환 즉시 본문을 감춘다', async () => {
  await prisma.appSetting.deleteMany({ where: { key: { in: [publicPortfolioKey, privateKey] } } });
  await prisma.appSetting.create({ data: { key: privateKey, value: { phone: 'private-phone', identifier: 'private-number', sourceUrls: ['private-original'] } } });
  const privateBefore = await prisma.appSetting.findUnique({ where: { key: privateKey } });
  assert.equal(await getPublicPortfolio(), null);
  assert.equal(await getPublishedPortfolio(), null);
  assert.equal(await prisma.appSetting.count({ where: { key: publicPortfolioKey } }), 0);
  const saved = await savePublicPortfolio(input(), 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await getPublishedPortfolio(), input().content);
  assert.doesNotMatch(JSON.stringify(await getPublishedPortfolio()), /revision|updatedAt|private-/);
  await savePublicPortfolio({ ...input(), published: false }, 1);
  assert.equal(await getPublishedPortfolio(), null);
  assert.equal((await getPublicPortfolio()).content.name, '테스트');
  assert.deepEqual(await prisma.appSetting.findUnique({ where: { key: privateKey } }), privateBefore);
});
test('동시 생성과 갱신은 한 요청만 성공하며 충돌한 요청이 기존 내용을 덮어쓰지 않는다', async () => {
  await prisma.appSetting.deleteMany({ where: { key: publicPortfolioKey } });
  const results = await Promise.allSettled([savePublicPortfolio(input(), 0), savePublicPortfolio({ ...input(), published: false }, 0)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.status, 409);
  const edits = await Promise.allSettled(['첫 수정', '다른 수정'].map(name => savePublicPortfolio({ ...input(), content: { ...input().content, name } }, 1)));
  assert.equal(edits.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(edits.find(item => item.status === 'rejected').reason.status, 409);
  const current = await getPublicPortfolio();
  assert.equal(current.revision, 2);
  await assert.rejects(() => savePublicPortfolio(input(), 1), error => error.status === 409);
  assert.deepEqual(await getPublicPortfolio(), current);
});
test('공개 저장소에 잘못된 링크나 버전이 있으면 공개 조회를 거절한다', async () => {
  const invalid = input(); invalid.content.links = [{ label: '잘못된 링크', url: 'javascript:alert(1)' }];
  await prisma.appSetting.upsert({ where: { key: publicPortfolioKey }, create: { key: publicPortfolioKey, value: { ...invalid, revision: 1, updatedAt: new Date().toISOString() } }, update: { value: { ...invalid, revision: 1, updatedAt: new Date().toISOString() } } });
  await assert.rejects(() => getPublishedPortfolio());
});
