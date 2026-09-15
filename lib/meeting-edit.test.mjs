import assert from 'node:assert/strict';
import test from 'node:test';

const api = await import('./meeting-edit.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const chart = { slug: 'meeting', title: '회의', nodes: [], edges: [], description: '설명',
  content: { kind: 'meeting', date: '2026-09-14', participants: ['참석자'], summary: '요약',
    discussions: [{ title: '논의', text: '보존' }], decisions: ['기존 결정'],
    actionItems: [{ task: '기존 태스크', owner: null, dueDate: null }], transcript: '원문\n보존' } };

test('결정 사항과 태스크 편집은 원문과 다른 회의 필드를 보존한다', () => {
  assert.equal(typeof api.editMeetingOutcomes, 'function');
  const saved = api.editMeetingOutcomes(chart, { decisions: ['수정', '추가'], actionItems: [] });
  assert.deepEqual(saved, { ...chart, content: { ...chart.content, decisions: ['수정', '추가'], actionItems: [] } });
  assert.deepEqual(chart.content.decisions, ['기존 결정']);
  assert.equal(chart.content.actionItems.length, 1);
});

test('빈 항목과 잘못된 기한을 거부하고 담당자와 기한 미정은 허용한다', () => {
  assert.equal(typeof api.editMeetingOutcomes, 'function');
  for (const changes of [
    { decisions: ['  '], actionItems: [] },
    { decisions: [], actionItems: [{ task: '', owner: null, dueDate: null }] },
    { decisions: [], actionItems: [{ task: '검토', owner: null, dueDate: '2026-02-30' }] },
  ]) assert.throws(() => api.editMeetingOutcomes(chart, changes));
  assert.doesNotThrow(() => api.editMeetingOutcomes(chart, { decisions: [], actionItems: [{ task: '검토', owner: null, dueDate: null }] }));
  assert.throws(() => api.editMeetingOutcomes({ ...chart, content: { kind: 'notice', text: '안내' } }, { decisions: [], actionItems: [] }));
});
