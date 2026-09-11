import assert from 'node:assert/strict';
import test from 'node:test';

const chart = () => ({slug:'sample',title:'주문',nodes:[{id:'a',data:{kind:'entry',label:'접수'}},{id:'b',data:{kind:'activate',label:'확정'}}],edges:[{id:'ab',source:'a',target:'b',kind:'impl'}]});
const load = async () => import('./document.ts').catch(e => { if(e.code==='ERR_MODULE_NOT_FOUND') return {}; throw e; });
test('accepts serializable charts and preserves node text', async () => {
  const {parseFlowChart} = await load();
  assert.equal(typeof parseFlowChart,'function');
  assert.deepEqual(parseFlowChart(JSON.parse(JSON.stringify(chart()))),chart());
});
test('rejects broken graph references, duplicate IDs and unsupported presentation values', async () => {
  const {parseFlowChart} = await load();
  assert.equal(typeof parseFlowChart,'function');
  for(const mutate of [c=>c.edges[0].target='missing',c=>c.nodes[1].id='a',c=>c.nodes[0].group='missing',c=>c.nodes[0].data.kind='bogus',c=>c.direction='RL',c=>c.nodeWidth=-1,c=>c.nodes[0].data.label={},c=>c.howToRead=[4]]){
    const input=chart();mutate(input);assert.throws(()=>parseFlowChart(input));
  }
});
test('rejects invalid root values and accepts empty charts', async () => {
  const {parseFlowChart} = await load();assert.equal(typeof parseFlowChart,'function');
  for(const value of [null,[],{}, {slug:'../bad',title:'x',nodes:[],edges:[]}]) assert.throws(()=>parseFlowChart(value));
  assert.equal(parseFlowChart({slug:'empty',title:'Empty',nodes:[],edges:[]}).slug,'empty');
});
