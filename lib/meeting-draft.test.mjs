import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('./meeting-draft.ts').catch(e => { if(e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const input = { projectSlug: 'tns', slug: 'meeting-2026-09-14', title: '재고 이관', date: '2026-09-14',
  transcript: '\uFEFF김담당: 목록을 전달하겠습니다.\r\n기한은 미정입니다.\r\n',
  notes: { participants: ['김담당'], summary: '목록 전달', discussions: [], decisions: [],
    actionItems: [{ task: '목록 전달', owner: '김담당', dueDate: null }] } };

test('전사본을 한 글자도 변경하지 않고 앱 문서로 조립한다', () => {
  assert.equal(typeof api.prepareMeetingDraft, 'function');
  const draft = api.prepareMeetingDraft(input);
  assert.equal(draft.chart.content.transcript, input.transcript);
  assert.equal(draft.chart.content.kind, 'meeting');
  assert.equal(draft.chart.content.actionItems[0].dueDate, null);
  assert.deepEqual(api.parseMeetingDraft(draft), draft);
  assert.equal(draft.transcriptSha256.length, 64);
});
test('잘못된 필드 이름, 누락된 날짜, 수정된 원문 해시를 거부한다', () => {
  assert.equal(typeof api.prepareMeetingDraft, 'function');
  assert.throws(() => api.prepareMeetingDraft({ ...input, date: '' }));
  assert.throws(() => api.prepareMeetingDraft({ ...input, notes: { ...input.notes, tasks: [] } }));
  assert.throws(() => api.prepareMeetingDraft({ ...input, transcript: ' ' }));
  const draft = api.prepareMeetingDraft(input);
  draft.chart.content.transcript += '변경';
  assert.throws(() => api.parseMeetingDraft(draft));
});
