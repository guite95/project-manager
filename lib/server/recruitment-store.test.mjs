import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from './test-db.mjs';
const api = await import('./recruitment-store.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const id = 'test-recruitment-document';
const input = { kind: 'EXPERIENCE', title: '근거 보존', project: '테스트', scope: 'PERSONAL', summary: '요약', tags: [], sections: [{ title: '근거', body: '커밋 내용' }], sourceUrls: [] };
after(async () => { await prisma.appSetting.deleteMany({ where: { key: { in: [`recruitment:document:${id}`, `recruitment:document:${id}-portfolio`] } } }); await prisma.$disconnect(); });
test('조회는 생성하지 않고 저장·독립 조회·동시 편집 충돌을 보장한다', async () => {
  assert.equal(typeof api.getRecruitmentDocument, 'function');
  await prisma.appSetting.deleteMany({ where: { key: `recruitment:document:${id}` } });
  assert.equal(await api.getRecruitmentDocument(id), null);
  assert.equal(await prisma.appSetting.count({ where: { key: `recruitment:document:${id}` } }), 0);
  const created = await api.saveRecruitmentDocument(id, input, 0);
  assert.equal(created.revision, 1);
  assert.deepEqual(await api.getRecruitmentDocument(id), created);
  const catalog = await api.listRecruitmentDocuments('EXPERIENCE');
  const summary = catalog.find(row => row.id === id);
  assert.equal(summary.title, input.title);
  assert.equal('sections' in summary, false);
  assert.equal((await api.listRecruitmentDocuments('COVER_LETTER')).some(row => row.id === id), false);
  const results = await Promise.allSettled(['첫 편집', '다른 편집'].map(title => api.saveRecruitmentDocument(id, { ...input, title }, 1)));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const failed = results.find(row => row.status === 'rejected');
  assert.equal(failed.reason.status, 409);
  const saved = await api.getRecruitmentDocument(id);
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.sections, input.sections);
  await assert.rejects(() => api.saveRecruitmentDocument(id, { ...input, kind: 'COVER_LETTER' }, 2), /종류/);
});
test('포트폴리오는 다른 채용 목록과 분리되고 기존 원문과 수정 버전을 보존한다', async () => {
  const portfolioId = `${id}-portfolio`;
  await prisma.appSetting.deleteMany({ where: { key: `recruitment:document:${portfolioId}` } });
  const portfolio = { ...input, kind: 'PORTFOLIO' };
  const created = await api.saveRecruitmentDocument(portfolioId, portfolio, 0);
  assert.deepEqual(await api.getRecruitmentDocument(portfolioId), created);
  const rows = await api.listRecruitmentDocuments('PORTFOLIO');
  const summary = rows.find(row => row.id === portfolioId);
  assert.equal(summary.title, portfolio.title);
  assert.equal('sections' in summary, false);
  assert.equal('sourceUrls' in summary, false);
  for (const kind of ['EXPERIENCE', 'COVER_LETTER']) {
    assert.equal((await api.listRecruitmentDocuments(kind)).some(row => row.id === portfolioId), false);
  }
  const edited = await api.saveRecruitmentDocument(portfolioId, { ...portfolio, sections: [{ title: '프로필', body: '수정한 내용' }] }, 1);
  await assert.rejects(() => api.saveRecruitmentDocument(portfolioId, portfolio, 1), error => error.status === 409);
  assert.deepEqual(await api.getRecruitmentDocument(portfolioId), edited);
});
