import assert from 'node:assert/strict';
import { test } from 'node:test';

const api = await import('./recruitment.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const input = { kind: 'EXPERIENCE', title: '전표 원천 추적', project: 'ERP', scope: 'COMPANY', summary: '재시도와 업무 원천 분리', tags: ['추적성'], sections: [{ title: '본인 작업', body: 'sourceRef 연결' }], sourceUrls: [] };
test('경험 내용과 근거를 보존하고 저장용 버전은 입력에서 받지 않는다', () => {
  assert.equal(typeof api.parseRecruitmentDocument, 'function');
  assert.deepEqual(api.parseRecruitmentDocument({ ...input, revision: 999 }), input);
});
test('잘못된 분류, 빈 제목, 과도한 본문 및 실행 가능한 출처 URL을 거절한다', () => {
  assert.equal(typeof api.parseRecruitmentDocument, 'function');
  for (const patch of [{ kind: 'OTHER' }, { scope: '1.PERSONAL' }, { title: ' ' }, { sourceUrls: ['javascript:alert(1)'] }, { sections: [{ title: '본문', body: 'a'.repeat(80_001) }] }]) {
    assert.throws(() => api.parseRecruitmentDocument({ ...input, ...patch }));
  }
});
test('작성 가이드와 근거를 포함한 복사문을 생성한다', () => {
  assert.equal(typeof api.recruitmentText, 'function');
  const text = api.recruitmentText(input);
  assert.match(text, /전표 원천 추적/);
  assert.match(text, /본인 작업\nsourceRef 연결/);
});
test('편집 화면에서 지운 선택 입력과 끝의 빈 줄은 빈 값으로 저장한다', () => {
  const result = api.parseRecruitmentDocument({ ...input, tags: ['', ' 추적성 ', ''], sourceUrls: [''] });
  assert.deepEqual(result.tags, ['추적성']);
  assert.deepEqual(result.sourceUrls, []);
});
