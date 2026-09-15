import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFlowChart } from './flows/document.ts';

const meeting = {
  slug: 'meeting-2026-09-14', title: '요구사항 회의', nodes: [], edges: [],
  content: { kind: 'meeting', date: '2026-09-14', participants: ['김담당'],
    summary: '요구사항 검토', discussions: [{ title: '일정', text: '다음 회의에서 확정' }],
    decisions: ['초안 검토'], actionItems: [{ task: '자료 전달', owner: null, dueDate: null }],
    transcript: '발언자: 원문 <script>도 텍스트로 보존합니다.' },
};

test('회의록과 선택적인 전사본 원문을 기존 문서 형식으로 읽는다', () => {
  assert.deepEqual(parseFlowChart(meeting), meeting);
  const withoutTranscript = structuredClone(meeting);
  delete withoutTranscript.content.transcript;
  assert.doesNotThrow(() => parseFlowChart(withoutTranscript));
});

test('잘못된 날짜와 회의록 필드 형식을 거부한다', () => {
  for (const changes of [
    { date: '2026-02-30' }, { date: 'yesterday' }, { participants: [1] },
    { summary: {} }, { discussions: [{ title: '논의' }] }, { decisions: '확정' },
    { actionItems: [{ task: '자료', owner: 1, dueDate: null }] },
    { actionItems: [{ task: '자료', owner: null, dueDate: '2026-13-01' }] },
    { transcript: {} },
  ]) assert.throws(() => parseFlowChart({ ...meeting, content: { ...meeting.content, ...changes } }));
});
