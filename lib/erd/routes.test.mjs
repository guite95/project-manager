import assert from 'node:assert/strict';
import test from 'node:test';
import { makeErdChart, erdDomains } from './tns.ts';
import { layoutErd } from './layout.ts';
const api = await import('./routes.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const crosses = (a, b, n) => a.x === b.x
  ? a.x > n.x && a.x < n.x + n.width && Math.max(a.y, b.y) > n.y && Math.min(a.y, b.y) < n.y + n.height
  : a.y > n.y && a.y < n.y + n.height && Math.max(a.x, b.x) > n.x && Math.min(a.x, b.x) < n.x + n.width;

test('관계선은 실제 TNS 카드 내부를 통과하지 않으며 모든 FK와 양 끝점을 보존한다', () => {
  assert.equal(typeof api.routeErd, 'function');
  for (const domain of erdDomains) {
    const chart = makeErdChart(domain.slug);
    const tables = chart.nodes.map(n => ({id:n.id,width:360,height:87+n.data.entity.fields.length*23,domain:n.data.entity.domain,external:n.data.entity.external}));
    const layout = layoutErd(tables, chart.edges);
    const result = api.routeErd(layout.nodes, chart.edges);
    assert.deepEqual(result.routes.map(r => r.id).sort(), chart.edges.map(e => e.id).sort());
    for (const route of result.routes) {
      const edge = chart.edges.find(e => e.id === route.id);
      const source = result.ports[edge.source].find(p => p.id === route.sourceHandle);
      const target = result.ports[edge.target].find(p => p.id === route.targetHandle);
      assert.equal(source.type, 'source');
      assert.equal(target.type, 'target');
      assert.deepEqual(route.points[0], {x:source.x,y:source.y});
      assert.deepEqual(route.points.at(-1), {x:target.x,y:target.y});
      for (let i=1;i<route.points.length;i++) {
        const a=route.points[i-1], b=route.points[i];
        assert.ok(a.x === b.x || a.y === b.y, 'orthogonal');
        for (const node of layout.nodes) assert.equal(crosses(a,b,node),false, `${domain.slug}/${edge.id}/${node.id}`);
      }
    }
  }
});

test('복수 FK와 자기 참조는 서로 다른 연결점을 사용하며 결정적으로 배치된다', () => {
  assert.equal(typeof api.routeErd, 'function');
  const nodes=[{id:'a',x:0,y:0,width:360,height:230},{id:'b',x:500,y:0,width:360,height:230}];
  const edges=[{id:'fk1',source:'a',target:'b'},{id:'fk2',source:'a',target:'b'},{id:'self',source:'a',target:'a'}];
  const result=api.routeErd(nodes,edges);
  assert.notDeepEqual(result.routes[0].points,result.routes[1].points);
  assert.deepEqual(api.routeErd(nodes,[...edges].reverse()),result);
  assert.deepEqual(api.routeErd([],[]), {routes:[],ports:{}});
});
