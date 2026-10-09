import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyApplication } from '../recruitment-applications.ts';
import { draftFromApplication, inputFromDraft } from '../../components/recruitment/application-draft.ts';

function draft(patch = {}) {
  return { ...draftFromApplication('application-1', { ...emptyApplication(), company: '회사', role: '직무' }), deadlineChanged: true, ...patch };
}

test('마감 날짜만 입력하면 오류를 표시하고 입력값을 유지한다', () => {
  const value = draft({ deadlineDate: '2026-10-20' });
  const before = structuredClone(value);
  assert.throws(() => inputFromDraft(value), /마감 날짜와 시간을 함께/);
  assert.deepEqual(value, before);
});

test('마감 시각만 입력하면 오류를 표시하고 입력값을 유지한다', () => {
  const value = draft({ deadlineTime: '18:00' });
  const before = structuredClone(value);
  assert.throws(() => inputFromDraft(value), /마감 날짜와 시간을 함께/);
  assert.deepEqual(value, before);
});

test('날짜와 시각을 함께 비웠을 때만 마감을 해제한다', () => {
  const value = draftFromApplication('application-1', { ...emptyApplication(), deadlineAt: '2026-10-20T18:00:00+09:00' });
  assert.equal(inputFromDraft({ ...value, deadlineDate: '', deadlineTime: '', deadlineChanged: true }).deadlineAt, null);
  assert.throws(() => inputFromDraft({ ...value, deadlineTime: '', deadlineChanged: true }), /마감 날짜와 시간을 함께/);
});

test('입력한 마감은 명시한 한국 시간으로 저장한다', () => {
  assert.equal(inputFromDraft(draft({ deadlineDate: '2026-10-20', deadlineTime: '18:30' })).deadlineAt, '2026-10-20T18:30:00+09:00');
});

test('유효하지 않은 시각을 임의로 보정하지 않는다', () => {
  for (const deadlineTime of ['24:00', '12:60', '9:00', '18시', '  ']) {
    assert.throws(() => inputFromDraft(draft({ deadlineDate: '2026-10-20', deadlineTime })), /24시간 기준 HH:mm/);
  }
});

test('마감을 편집하지 않으면 원래 시각과 정밀도를 유지한다', () => {
  const deadlineAt = '2026-10-20T01:15:27.123Z';
  const value = draftFromApplication('application-1', { ...emptyApplication(), deadlineAt });
  assert.equal(value.deadlineDate, '2026-10-20');
  assert.equal(value.deadlineTime, '10:15');
  assert.equal(inputFromDraft(value).deadlineAt, deadlineAt);
});

test('서버 메타 필드를 저장 본문에서 제외하고 원본을 복제한다', () => {
  const record = { ...emptyApplication(), id: 'application-1', revision: 3, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', experienceIds: ['experience-1'] };
  const value = draftFromApplication(record.id, record, record.revision);
  assert.deepEqual(Object.keys(value.application).sort(), Object.keys(emptyApplication()).sort());
  assert.equal(value.expectedRevision, 3);
  value.application.experienceIds.push('experience-2');
  assert.deepEqual(record.experienceIds, ['experience-1']);
});
