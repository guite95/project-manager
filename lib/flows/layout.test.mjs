import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlowChart } from './document.ts';
import { preserveFlowLayout } from './layout.ts';
import { parseFlowEnvelope, flowDiff } from './cli-document.ts';
const chart = { slug: 'work', title: '업무', nodes: [{ id: 'a', data: { role: 'screen', screen: '목록', kind: 'core', label: '등록' } }, { id: 'b', data: { role: 'logic', kind: 'core', label: '검증' } }], edges: [{ id: 'ab', source: 'a', target: 'b', kind: 'impl' }] };
const layout = { nodes: { a: { x: 10, y: -30 } }, edges: { ab: { sourcePort: 'bottom', targetPort: 'left', waypoints: [{ x: 20, y: 30 }] } } };
test('layout JSON round trips and rejects nonfinite, invalid ports and orphan ids', () => {
  assert.deepEqual(parseFlowChart(JSON.parse(JSON.stringify({ ...chart, layout }))).layout, layout);
  for (const bad of [
    { ...layout, nodes: { a: { x: Infinity, y: 0 } } },
    { ...layout, nodes: { missing: { x: 0, y: 0 } } },
    { ...layout, edges: { ab: { sourcePort: 'diagonal' } } },
    { ...layout, edges: { missing: {} } },
  ]) assert.throws(() => parseFlowChart({ ...chart, layout: bad }));
  assert.throws(() => parseFlowChart({ ...chart, nodes: [{ id: 'a', data: { role: 'logic', screen: '없는 화면', label: '검증', kind: 'core' } }], edges: [] }));
});
test('content-only edits retain surviving positions and discard routes with changed endpoints', () => {
  const current = { ...chart, layout };
  assert.deepEqual(preserveFlowLayout(current, { ...chart, title: '수정' }).layout, layout);
  assert.deepEqual(preserveFlowLayout(current, { ...chart, edges: [{ ...chart.edges[0], source: 'b', target: 'a' }] }).layout.edges, {});
  assert.deepEqual(preserveFlowLayout(current, { ...chart, nodes: chart.nodes.slice(1), edges: [] }).layout, { nodes: {}, edges: {} });
  assert.deepEqual(preserveFlowLayout(current, { ...chart, layout: { nodes: {}, edges: {} } }).layout, { nodes: {}, edges: {} });
});
test('CLI envelope requires explicit revision and generic chart; diff reports changed field', () => {
  const row = { projectSlug: 'test', categorySlug: 'work', revision: 0, chart };
  assert.equal(parseFlowEnvelope(row).revision, 0);
  assert.throws(() => parseFlowEnvelope({ ...row, revision: undefined }));
  assert.throws(() => parseFlowEnvelope({ ...row, chart: { ...chart, erdDomain: 'sales' } }));
  assert.deepEqual(flowDiff(chart, { ...chart, title: 'new' }), [{ path: '/title', before: '업무', after: 'new' }]);
});
