import assert from 'node:assert/strict';
import test from 'node:test';
import { makeErdChart, erdDomains } from './tns.ts';

const api = await import('./layout.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const table = (id, external = false) => ({ id, width: 360, height: 220, domain: '업무', external });
const boundsOverlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('같은 테이블을 참조하는 25개 테이블을 여러 행과 열로 펼치고 겹치지 않는다', () => {
  assert.equal(typeof api.layoutErd, 'function');
  const nodes = Array.from({ length: 25 }, (_, i) => table(`n${i}`));
  const edges = nodes.slice(1).map(n => ({ source: n.id, target: 'n0' }));
  const result = api.layoutErd(nodes, edges);
  assert.equal(result.nodes.length, nodes.length);
  assert.ok(result.width / result.height > 1 && result.width / result.height < 2.4);
  assert.ok(new Set(result.nodes.map(n => n.x)).size >= 3);
  for (const a of result.nodes) for (const b of result.nodes) if (a.id !== b.id) assert.equal(boundsOverlap(a, b), false);
});

test('독립적인 관계 묶음과 다른 영역의 참조 테이블을 구분하며 입력 순서에 흔들리지 않는다', () => {
  assert.equal(typeof api.layoutErd, 'function');
  const nodes = ['a', 'b', 'c', 'd'].map(id => table(id)).concat(table('external', true));
  const edges = [{source:'a',target:'b'}, {source:'c',target:'d'}, {source:'a',target:'external'}, {source:'a',target:'a'}];
  const result = api.layoutErd(nodes, edges);
  const group = id => result.nodes.find(n => n.id === id).group;
  assert.equal(group('a'), group('b'));
  assert.equal(group('c'), group('d'));
  assert.notEqual(group('a'), group('c'));
  assert.notEqual(group('a'), group('external'));
  assert.deepEqual(api.layoutErd([...nodes].reverse(), [...edges].reverse()), result);
});

test('기존 TNS 스냅샷의 모든 영역에서 테이블과 그룹이 겹치거나 누락되지 않는다', () => {
  assert.equal(typeof api.layoutErd, 'function');
  for (const domain of erdDomains) {
    const chart = makeErdChart(domain.slug);
    const nodes = chart.nodes.map(n => ({ ...table(n.id, n.data.entity.external), domain: n.data.entity.domain, height: 87 + n.data.entity.fields.length * 23 }));
    const before = structuredClone(nodes);
    const result = api.layoutErd(nodes, chart.edges);
    assert.deepEqual(result.nodes.map(n => n.id).sort(), nodes.map(n => n.id).sort());
    assert.deepEqual(nodes, before);
    assert.ok(result.width / result.height > 0.85 && result.width / result.height < 2.8, domain.slug);
    for (const boxes of [result.nodes, result.groups]) {
      for (const a of boxes) for (const b of boxes) if (a.id !== b.id) assert.equal(boundsOverlap(a, b), false, `${domain.slug}: ${a.id}/${b.id}`);
    }
    for (const n of result.nodes) {
      const g = result.groups.find(g => g.id === n.group);
      assert.ok(n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height);
    }
  }
});

test('빈 영역과 관계 없는 단일 테이블도 유효한 좌표를 만든다', () => {
  assert.equal(typeof api.layoutErd, 'function');
  assert.deepEqual(api.layoutErd([], []), { nodes: [], groups: [], width: 0, height: 0 });
  const result = api.layoutErd([table('only')], [{source:'missing',target:'only'}]);
  assert.equal(result.nodes.length, 1);
  assert.ok(Number.isFinite(result.nodes[0].x));
});
