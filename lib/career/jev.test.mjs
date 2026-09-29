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

const questions={q:{type:'score',instructions:'grade',criteria:['none','weak','partial','clear','complete']}};
function response(score,probabilities){return {id:'live-rounded',model:'typesafe/jev-1.13-20260917',answers:{q:{type:'score',score,probabilities,confidence:.7}},usage:{input_tokens:100,output_tokens:20,cost:.0000042}};}
test('실응답의 2자리 확률 반올림과 0.03 점수 차이를 수용하고 원래 수치를 보존한다',()=>{
  const raw=response(3.53,{0:.01,1:.02,2:.05,3:.30,4:.62});
  assert.equal(api.parseDecisions(raw,questions).answers.q.score,3.53);
  const rounded=response(3.56,{0:0,1:.01,2:.03,3:.34,4:.61});
  assert.deepEqual(api.parseDecisions(rounded,questions).answers.q.probabilities,rounded.answers.q.probabilities);
});
test('반올림 허용은 불가능한 확률 질량이나 점수를 통과시키지 않는다',()=>{
  for(const raw of [response(4,{0:0,1:0,2:0,3:0,4:.9}),response(3.8,{0:0,1:0,2:0,3:0,4:1}),response(3,{0:0,1:0,2:0,3:1,4:-.01})])assert.throws(()=>api.parseDecisions(raw,questions));
  const choices={q:{type:'choice',instructions:'pick',criteria:{A:'a',B:'b',C:'c'}}};
  const raw=response(0,{});raw.answers.q={type:'choice',choice:'A',probabilities:{A:.4,B:.5,C:.1},confidence:.8};
  assert.throws(()=>api.parseDecisions(raw,choices),/INVALID_PROVIDER_CHOICE/);
});
test('실제 양자화 응답의 가중평균 3.25와 score 3.29를 허용하되 큰 오차는 거부한다',()=>{
  const raw=response(3.29,{0:.01,1:.01,2:.2,3:.28,4:.5});
  assert.equal(api.parseDecisions(raw,questions).answers.q.score,3.29);
  raw.answers.q.score=3.4;assert.throws(()=>api.parseDecisions(raw,questions),/INVALID_PROVIDER_SCORE/);
});
test('예상하지 않은 모델 응답도 비용 영수증은 보존하되 평가로는 거절한다',()=>{
  const raw=response(4,{0:0,1:0,2:0,3:0,4:1});raw.model='unexpected-model';
  assert.equal(api.readDecisionReceipt(raw)?.usage.cost,.0000042);
  assert.throws(()=>api.parseDecisions(raw,questions),/INVALID_PROVIDER_RESPONSE/);
});
