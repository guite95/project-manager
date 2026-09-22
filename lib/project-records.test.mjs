import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyProjectRecords, parseProjectRecords } from './project-records.ts';

test('빈 개요를 작성할 수 있고 기록은 일반 텍스트로 보존한다', () => {
  const input = emptyProjectRecords();
  input.overview.role = '<script>텍스트로 보존</script>\n직접 맡은 범위';
  assert.deepEqual(parseProjectRecords(input), { overview: input.overview, works: [] });
  assert.equal(emptyProjectRecords().overview.role, '');
});
test('잘못된 입력 및 항목·문서 전체 크기 제한을 검증한다', () => {
  for (const input of [null, [], {}, { overview: {}, works: [] }, { ...emptyProjectRecords(), works: 'text' }]) {
    assert.throws(() => parseProjectRecords(input));
  }
  const input = emptyProjectRecords();
  input.overview.purpose = 'a'.repeat(20_001);
  assert.throws(() => parseProjectRecords(input));
  const long = 'a'.repeat(20_000);
  assert.throws(() => parseProjectRecords({ overview: { purpose: long, period: long, participants: long, role: long }, works: [{ id: 'one', title: '제목', summary: '', work: long, decisions: '', results: '', evidence: '' }] }), error => error.status === 413);
});
