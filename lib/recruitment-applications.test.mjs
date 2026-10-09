import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicationInputSchema, applicationTaskSchema, applicationSummary, emptyApplication, parseApplication } from './recruitment-applications.ts';
const input = () => ({ ...emptyApplication(), company: '예시 회사', role: '개발자' });
test('마감 시간대와 제외 사유를 검증하고 알 수 없는 필드를 거부한다', () => {
  assert.equal(parseApplication(applicationInputSchema, input()).deadlineAt, null);
  for (const change of [{ deadlineAt: '2026-10-20' }, { deadlineAt: '2026-10-20T18:00:00' }, { status: 'EXCLUDED' }, { public: true }, { experienceIds: ['same','same'] }]) {
    assert.throws(() => parseApplication(applicationInputSchema, { ...input(), ...change }), error => error.status === 400);
  }
  assert.equal(parseApplication(applicationInputSchema, { ...input(), deadlineAt: '2026-10-20T18:00:00+09:00' }).deadlineAt, '2026-10-20T18:00:00+09:00');
  assert.equal(parseApplication(applicationInputSchema, { ...input(), status: 'EXCLUDED', exclusionReason: '경력 조건 불일치' }).status, 'EXCLUDED');
});
test('목록은 메모와 연결 ID를 제외하고 개수만 제공한다', () => {
  const summary = applicationSummary({ ...input(), id: 'a', revision: 1, createdAt: 'now', updatedAt: 'now', notes: 'private note', experienceIds: ['e'] });
  assert.equal(summary.experienceCount, 1);
  assert.equal('notes' in summary, false);
  assert.equal('experienceIds' in summary, false);
});
test('태스크의 양끝 날짜와 실제 달력 날짜 및 버전 형식을 검증한다', () => {
  const value = { id: 'task', title: '서류 준비', done: false, placement: 'pool', startDate: null, endDate: null, expectedVersion: null };
  assert.deepEqual(parseApplication(applicationTaskSchema, value), value);
  for (const change of [{startDate:'2026-10-01'}, {startDate:'2026-02-30',endDate:'2026-03-01'}, {startDate:'2026-10-10',endDate:'2026-10-09'}, {expectedVersion:'1'}]) {
    assert.throws(() => parseApplication(applicationTaskSchema, {...value,...change}), error => error.status===400);
  }
});
