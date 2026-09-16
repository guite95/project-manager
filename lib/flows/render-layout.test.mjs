import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
// 브라우저 없이 실제 레이아웃과 노드 JSX를 검사한다.
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  module._compile(outputText, filename);
};
const { layoutChart } = require('../../components/flow/layout.ts');
const { FlowNode } = require('../../components/flow/flow-node.tsx');
const { ReactFlowProvider } = require('@xyflow/react');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const chart = { slug: 'layout-test', title: 'test', groups: [{ id: 'group', label: '그룹' }], nodes: [
  { id: 'a', group: 'group', data: { kind: 'core', label: '화면', role: 'screen', screen: '주문 상세', sections: [{ title: '기능', lines: ['제출'] }] } },
  { id: 'b', group: 'group', data: { kind: 'core', label: '처리', role: 'logic', sections: [{ title: '기능', lines: ['검증'] }] } },
], edges: [{ id: 'ab', source: 'a', target: 'b', kind: 'impl' }] };
test('manual positions round trip as absolute positions; groups contain moved nodes and routes retain ports', () => {
  const auto = layoutChart(chart);
  const parent = auto.nodes.find(n => n.id === 'group');
  const a = auto.nodes.find(n => n.id === 'a');
  const empty = layoutChart({ ...chart, layout: { nodes: {}, edges: {} } });
  assert.deepEqual(empty.nodes.find(n => n.id === 'a').position, { x: a.position.x + parent.position.x, y: a.position.y + parent.position.y });
  const layout = { nodes: { a: { x: -500, y: 700 } }, edges: { ab: { sourcePort: 'bottom', targetPort: 'top', waypoints: [{ x: 400, y: 600 }] } } };
  const result = layoutChart({ ...chart, layout });
  const moved = result.nodes.find(n => n.id === 'a'); const group = result.nodes.find(n => n.id === 'group');
  assert.equal(moved.parentId, undefined); assert.deepEqual(moved.position, layout.nodes.a);
  assert.ok(group.position.x < -500 && group.position.y < 700);
  assert.ok(group.position.y + group.data.h > 700);
  assert.equal(result.edges[0].sourceHandle, 'out-bottom'); assert.equal(result.edges[0].targetHandle, 'in-top');
  assert.deepEqual(result.edges[0].data.waypoints, layout.edges.ab.waypoints);
  assert.deepEqual(layoutChart(JSON.parse(JSON.stringify({ ...chart, layout }))).nodes, result.nodes);
});
test('legacy default handles precede named side handles; screen banner is absent on logic nodes', () => {
  const render = data => renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(FlowNode, { id: 'a', data: { ...data, dir: 'LR', w: 200 } })));
  const screen = render(chart.nodes[0].data);
  assert.match(screen, /주문 상세/);
  const firstSource = screen.match(/<div[^>]*class="[^"]*source[^"]*"[^>]*>/)?.[0];
  const firstTarget = screen.match(/<div[^>]*class="[^"]*target[^"]*"[^>]*>/)?.[0];
  assert.ok(firstSource && firstTarget);
  assert.ok(!firstSource.includes('data-handleid=')); assert.ok(!firstTarget.includes('data-handleid='));
  const logic = render({ ...chart.nodes[1].data, sections: [{ title: '화면', lines: ['잘못된 화면 배너'] }, { title: '기능', lines: ['검증'] }] });
  assert.ok(!logic.includes('잘못된 화면 배너')); assert.match(logic, /검증/);
});
