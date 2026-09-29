import assert from 'node:assert/strict';
import {test} from 'node:test';
const api=await import('./jev.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('고정 endpoint와 모델을 사용하고 provider 오류 원문/키를 노출하지 않는다',async()=>{
  assert.equal(typeof api.createJevProvider,'function');
  const call=api.createJevProvider('test-key',async(url,init)=>{
    assert.equal(url,'https://openrouter.ai/api/alpha/decisions');assert.equal(init.redirect,'error');
    const payload=JSON.parse(init.body);assert.equal(payload.model,'typesafe/jev-1.13');
    return new Response('secret upstream text',{status:401});
  });
  await assert.rejects(call({state:'test',questions:{q:{type:'score',instructions:'grade',criteria:['bad','ok','good','great','best']}}}),e=>e.message==='PROVIDER_HTTP_401');
});
test('초과 입력은 외부 전송 전에 거절한다',async()=>{
  assert.equal(typeof api.createJevProvider,'function');
  const call=api.createJevProvider('test-key',()=>assert.fail('must not send'));
  await assert.rejects(call({state:'x'.repeat(30000),questions:{}}),/PROVIDER_INPUT_LIMIT/);
});
