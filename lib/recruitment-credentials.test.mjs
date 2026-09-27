import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialText, parseRecruitmentCredentials } from './recruitment-credentials.ts';
import { recruitmentText } from './recruitment.ts';

const item = { id: 'sample', kind: 'CERTIFICATE', name: '테스트 자격', issuer: '기관', acquiredOn: '2025-09', identifier: '001234', grade: '', expiresOn: '', notes: '' };
test('연도·월만 알려진 날짜와 앞자리 0이 있는 번호를 보존한다', () => {
  for (const acquiredOn of ['2025', '2025-09', '2024-02-29', '']) {
    assert.deepEqual(parseRecruitmentCredentials([{ ...item, acquiredOn }]), [{ ...item, acquiredOn }]);
  }
});
test('중복 ID, 잘못된 종류·날짜, 너무 긴 정보는 저장하지 않는다', () => {
  assert.throws(() => parseRecruitmentCredentials([item, item]));
  for (const patch of [{ kind: 'OTHER' }, { name: ' ' }, { acquiredOn: '2025-02-29' }, { acquiredOn: '2025-13' }, { acquiredOn: '2025-00' }, { expiresOn: '2025-09-31' }, { identifier: 1234 }, { notes: 'a'.repeat(4001) }]) {
    assert.throws(() => parseRecruitmentCredentials([{ ...item, ...patch }]));
  }
});
test('지원용 항목 복사는 빈 값을 제외하며 일반 문서 복사는 비공개 정보를 포함하지 않는다', () => {
  assert.equal(credentialText(item), '자격증\n명칭: 테스트 자격\n발급·주관 기관: 기관\n취득·수상일: 2025-09\n자격증·등록 번호: 001234');
  const text = recruitmentText({ title: '포트폴리오', project: '', summary: '', sections: [{ title: '자격증', body: '테스트 자격' }], sourceUrls: [], credentials: [item] });
  assert.doesNotMatch(text, /001234|2025-09/);
});
