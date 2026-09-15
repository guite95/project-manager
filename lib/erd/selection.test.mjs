import assert from 'node:assert/strict';
import test from 'node:test';
const api = await import('./selection.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('선택한 테이블의 양방향 FK·중복 FK·자기 참조만 강조한다', () => {
  assert.equal(typeof api.erdSelection, 'function');
  const edges = [
    {id:'out',source:'a',target:'b'}, {id:'out2',source:'a',target:'b'},
    {id:'in',source:'c',target:'a'}, {id:'self',source:'a',target:'a'},
    {id:'other',source:'b',target:'c'},
  ];
  const result = api.erdSelection(['a','b','c','d'], edges, 'a');
  assert.deepEqual([...result.nodes].sort(), ['a','b','c']);
  assert.deepEqual([...result.edges].sort(), ['in','out','out2','self']);
  assert.equal(api.erdSelection(['a'], edges, ''), null);
  assert.equal(api.erdSelection(['a'], edges, 'missing'), null);
});
