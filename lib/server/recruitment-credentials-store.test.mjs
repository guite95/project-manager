import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from './test-db.mjs';
import { getRecruitmentCredentials, saveRecruitmentCredentials } from './recruitment-credentials-store.ts';
import { credentialsKey } from '../recruitment-credentials.ts';
import { listRecruitmentDocuments } from './recruitment-store.ts';

const item = { id: 'test-credential', kind: 'AWARD', name: '테스트 수상', issuer: '기관', acquiredOn: '2025', identifier: 'private-001', grade: '우수상', expiresOn: '', notes: '' };
after(async () => { await prisma.appSetting.deleteMany({ where: { key: credentialsKey } }); await prisma.$disconnect(); });
test('지원용 정보 조회는 생성하지 않고 저장은 충돌 시 기존 내용을 보존한다', async () => {
  await prisma.appSetting.deleteMany({ where: { key: credentialsKey } });
  assert.deepEqual(await getRecruitmentCredentials(), { items: [], revision: 0, updatedAt: null });
  assert.equal(await prisma.appSetting.count({ where: { key: credentialsKey } }), 0);
  const results = await Promise.allSettled([saveRecruitmentCredentials([item], 0), saveRecruitmentCredentials([{ ...item, notes: '다른 내용' }], 0)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  const initial = await getRecruitmentCredentials();
  assert.equal(initial.revision, 1);
  const edits = await Promise.allSettled(['첫 편집', '다른 편집'].map(notes => saveRecruitmentCredentials([{ ...item, notes }], 1)));
  assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(edits.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal((await getRecruitmentCredentials()).revision, 2);
  for (const kind of ['PORTFOLIO', 'EXPERIENCE', 'COVER_LETTER']) {
    assert.doesNotMatch(JSON.stringify(await listRecruitmentDocuments(kind)), /private-001|test-credential/);
  }
  await saveRecruitmentCredentials([], 2);
  assert.deepEqual((await getRecruitmentCredentials()).items, []);
});
