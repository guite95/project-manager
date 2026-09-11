import assert from 'node:assert/strict';
import test from 'node:test';
import { makeErdChart, erdDomains, tnsSchema, domainOf } from './tns.ts';

test('영역 ERD가 모든 테이블과 모든 FK를 빠짐없이 포함한다', () => {
  const charts = erdDomains.map(d => makeErdChart(d.slug));
  const roots = charts.flatMap(c => c.nodes.filter(n => !n.data.entity.external).map(n => n.id));
  assert.deepEqual([...roots].sort(), tnsSchema.models.map(m => m.name).sort());
  const relationIds = charts.flatMap(c => c.edges.map(e => e.id));
  assert.deepEqual(relationIds.sort(), tnsSchema.relations.map(r => r.id).sort());
  for (const chart of charts) {
    assert.ok(chart.nodes.length);
    const ids = new Set(chart.nodes.map(n => n.id));
    for (const edge of chart.edges) assert.ok(ids.has(edge.source) && ids.has(edge.target));
  }
});

test('테이블 집중 보기는 들어오고 나가는 FK 및 자체 참조를 모두 보존한다', () => {
  const focus = 'purchase_orders';
  const chart = makeErdChart(domainOf(focus).slug, focus);
  assert.deepEqual(chart.edges.map(e => e.id).sort(), tnsSchema.relations.filter(r => r.source === focus || r.target === focus).map(r => r.id).sort());
  assert.ok(chart.edges.some(e => e.target === focus));
  assert.ok(chart.edges.some(e => e.source === focus));
});
