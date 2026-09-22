import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { prisma } from './test-db.mjs';
const api = await import('./project-records-store.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const owner = { id: 'records-owner', role: 'OWNER', memberships: [] };
const slug = 'test-personal-records';
const other = 'test-other-records';
const key = `project:records:${slug}`;
const document = {
  overview: { purpose: '목적', period: '2026', participants: '2명', role: '백엔드' },
  works: [{ id: 'work-1', title: '업로드 개선', summary: '실패 원인 수정', work: '구현 내용', decisions: '대안 비교', results: '테스트 통과 / 배포 미확인', evidence: '관련 커밋' }],
};
after(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { in: [key, `project:records:${other}`] } } });
  await prisma.projectNote.deleteMany({ where: { projectSlug: slug } });
  await prisma.flowProject.deleteMany({ where: { slug: { in: [slug, other] } } });
  await prisma.$disconnect();
});
test('개인 기록은 소유자만 접근하고 프로젝트별로 저장하며 이전 메모와 동시 편집을 보존한다', async () => {
  assert.equal(typeof api.getProjectRecords, 'function');
  for (const [id, scope] of [[slug, 'PERSONAL'], [other, 'COMPANY']]) {
    await prisma.flowProject.upsert({ where: { slug: id }, create: { slug: id, title: id, position: 999, scope, personalGroup: scope === 'PERSONAL' ? 'TOY' : null }, update: {} });
  }
  await prisma.appSetting.deleteMany({ where: { key } });
  await prisma.projectNote.create({ data: { id: 'test-records-legacy', projectSlug: slug, content: '이전 메모 보존', priority: 'normal', position: 0, updatedAt: new Date() } });
  assert.equal(await api.getProjectRecords(owner, slug), null);
  assert.equal(await prisma.appSetting.count({ where: { key } }), 0);
  for (const role of ['ADMIN', 'MEMBER']) {
    const actor = { ...owner, role, memberships: [{ projectSlug: slug, role: 'EDITOR' }] };
    await assert.rejects(() => api.getProjectRecords(actor, slug), error => error.status === 403);
    await assert.rejects(() => api.saveProjectRecords(actor, slug, document, 0), error => error.status === 403);
  }
  await assert.rejects(() => api.getProjectRecords(owner, other), error => error.status === 404);
  await assert.rejects(() => api.saveProjectRecords(owner, 'not-found', document, 0), error => error.status === 404);
  await assert.rejects(() => api.saveProjectRecords(owner, slug, { ...document, works: [{ ...document.works[0], title: '' }] }, 0));
  await assert.rejects(() => api.saveProjectRecords(owner, slug, { ...document, works: [document.works[0], document.works[0]] }, 0));
  const created = await api.saveProjectRecords(owner, slug, document, 0);
  assert.equal(created.revision, 1);
  assert.deepEqual(await api.getProjectRecords(owner, slug), created);
  const outcomes = await Promise.allSettled(['A', 'B'].map(role => api.saveProjectRecords(owner, slug, { ...document, overview: { ...document.overview, role } }, 1)));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal((await api.getProjectRecords(owner, slug)).revision, 2);
  assert.equal((await prisma.projectNote.findUnique({ where: { id: 'test-records-legacy' } })).content, '이전 메모 보존');
  assert.equal(await prisma.appSetting.count({ where: { key: `project:records:${other}` } }), 0);
});
