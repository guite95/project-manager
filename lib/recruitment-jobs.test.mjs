import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as jobs from './recruitment-jobs.ts';
const { collectionBusy, parseJobQuery, requireJobId } = jobs;

test('플랫폼 접근 오류는 사용자가 구분할 수 있는 사유를 표시한다', () => {
  assert.equal(jobs.collectionReportReason({state:'FAILED',errors:[{code:'ROBOTS_HTTP_403'}]}),'사이트 접근 제한 (403)');
  assert.equal(jobs.collectionReportReason({state:'PARTIAL',limited:true,errorCount:0}),'수집 상한 도달 · 다음 회차에 계속');
  assert.equal(jobs.collectionReportReason({state:'SUCCESS'}),null);
  assert.equal(jobs.collectionReportReason({state:'SUCCESS',warnings:[{code:'ROBOTS_HTTP_403_CONTINUED'}]}),'robots 확인 불가 (403) · 공개 공고 수집');
  assert.equal(jobs.sourceReasons.DEFERRED,'수집 보류');
});

test('공고 검색은 기본 30개와 명시적인 페이지·사이트·상태 조건을 사용한다', () => {
  assert.deepEqual(parseJobQuery(new URLSearchParams()), { query: '', source: '', status: '', limit: 30, offset: 0 });
  assert.deepEqual(parseJobQuery(new URLSearchParams('q= ERP &source=wanted&status=UNKNOWN&page=3')),
    { query: 'ERP', source: 'wanted', status: 'UNKNOWN', limit: 30, offset: 60 });
});

test('수동 수집은 대기·실행 중에만 다시 요청할 수 없고 완료·실패 뒤에는 재요청할 수 있다', () => {
  for (const state of ['QUEUED', 'RUNNING']) assert.equal(collectionBusy({ state }), true);
  for (const state of ['SUCCESS', 'PARTIAL', 'FAILED']) assert.equal(collectionBusy({ state }), false);
  assert.equal(collectionBusy(null), false);
});

test('과도한 검색·잘못된 페이지·알 수 없는 사이트와 상태·문서 키를 거부한다', () => {
  for (const input of ['source=__proto__', 'source=unknown', 'status=toString', 'status=NEW', 'page=0', 'page=-1', 'page=1.2', 'page=1e3', 'page=99999999', `q=${'a'.repeat(151)}`]) {
    assert.throws(() => parseJobQuery(new URLSearchParams(input)));
  }
  assert.equal(requireJobId('a'.repeat(64)), 'a'.repeat(64));
  assert.throws(() => requireJobId('recruitment:document:private'));
});
