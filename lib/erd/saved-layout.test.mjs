import assert from 'node:assert/strict';
import test from 'node:test';
import { tnsSchema, makeErdChart } from './tns.ts';
import { parseSavedErdLayout, erdLayoutKey } from './saved-layout.ts';
import { generateErdLayouts, erdHash } from '../server/erd-layout-generator.ts';

const saved = generateErdLayouts(tnsSchema);
const chart = makeErdChart('finance');
const finance = saved.get(erdLayoutKey('finance'));
test('전체 영역과 집중 보기의 배치가 JSON 저장 후에도 유지된다', () => {
  assert.equal(saved.size,172+10);
  assert.deepEqual(parseSavedErdLayout(JSON.parse(JSON.stringify(finance)),chart),finance);
  assert.equal(erdHash({a:1,b:{c:2,d:3}}),erdHash({b:{d:3,c:2},a:1}));
});
test('누락·중복 노드, 잘못된 좌표, 참조되지 않는 연결점과 FK를 거절한다', () => {
  const cases = [
    v => v.layout.nodes.pop(),
    v => v.layout.nodes[0].x = NaN,
    v => v.layout.nodes[0].width = 1,
    v => v.layout.nodes[1].id = v.layout.nodes[0].id,
    v => v.routing.routes.pop(),
    v => v.routing.routes[0].sourceHandle = 'missing',
    v => v.routing.routes[0].points[0].x += 1,
    v => v.revision = 0,
  ];
  for (const change of cases) {
    const value=structuredClone(finance); change(value);
    assert.throws(()=>parseSavedErdLayout(value,chart));
  }
});
