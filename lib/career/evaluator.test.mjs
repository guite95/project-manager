import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,decisions} from './fixtures.mjs';
const api=await import('./evaluator.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const provider=score=>async request=>decisions(request.questions,score);
test('전체 통과와 JD 적용 제외: 문단 진단을 총점에 중복 반영하지 않는다',async()=>{
  assert.equal(typeof api.evaluate,'function');
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:provider(4)});
  assert.equal(r.status,'PASS');assert.equal(r.questionScores[0].score100,100);
  assert.deepEqual(r.questionScores[0].excludedMetricIds,['Q2']);assert.equal(r.counters.providerAttempts,1);
  assert.equal(r.coverage.missingCheckIds.length,0);
});
test('경계 점수에는 자동 수정 지시나 반복 호출을 내보내지 않는다',async()=>{
  assert.equal(typeof api.evaluate,'function');
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:provider(3)});
  assert.equal(r.status,'REVIEW');assert.equal(r.counters.providerAttempts,1);assert.deepEqual(r.rewriteTargets,[]);
});
test('미달 문단을 좁혀 검사하며 허용된 위치만 수정 대상으로 반환한다',async()=>{
  let call=0;
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:async request=>{
    if(++call===2){assert.equal(request.state.focus.current.text,'팀에서 API 오류를 분석했습니다.');assert.equal(request.state.focus.previous,null);}
    return decisions(request.questions,2);
  }});
  assert.equal(r.status,'REVISE');assert.equal(r.counters.providerAttempts,2);
  assert.ok(r.rewriteTargets.length);assert.ok(r.rewriteTargets.every(t=>t.target.paragraphId==='p1'));
  assert.equal(r.questionScores[0].score100,50);
});
test('호출 실패와 잘못된 확률 분포는 ERROR이고 실패를 통과로 채우지 않는다',async()=>{
  for(const provider of [async()=>{throw new Error('private secret');},async request=>{const r=decisions(request.questions);Object.values(r.answers)[0].probabilities={4:0.2};return r;}]) {
    const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider});
    assert.equal(r.status,'ERROR');assert.ok(r.coverage.missingCheckIds.length);
    assert.ok(!JSON.stringify(r).includes('private secret'));
  }
});
test('호출 한도와 긴 입력은 누락 범위를 표시하며 조용히 자르지 않는다',async()=>{
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:provider(2),providerAttempts:11});
  assert.equal(r.status,'INCOMPLETE');assert.equal(r.counters.providerAttempts,12);
  const x=fixture();x.sources[0].text+='가'.repeat(12000);
  const big=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:()=>assert.fail('must not call')});
  assert.equal(big.status,'INCOMPLETE');assert.equal(big.counters.providerAttempts,0);
});
test('누락 confidence와 불완전 JD는 정답 확률이나 확정 총점으로 바꾸지 않는다',async()=>{
  const missing=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:async request=>{
    const r=decisions(request.questions);for(const a of Object.values(r.answers))delete a.confidence;return r;
  }});
  assert.notEqual(missing.status,'PASS');assert.equal(missing.questionScores[0].score100,null);
  const x=fixture();x.jd.completeness='PARTIAL';
  const partial=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:provider(4)});
  assert.equal(partial.status,'NEEDS_INPUT');assert.equal(partial.questionScores[0].score100,null);
});

test('모델이 PASS라도 명시된 금지 문자열 위반은 결정적으로 잡는다',async()=>{
  const x=fixture();x.editScope.forbiddenClaims=['API 오류'];
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:provider(4)});
  assert.notEqual(r.status,'PASS');assert.ok(r.gates.some(g=>g.gateId==='G5'&&g.origin==='DETERMINISTIC'&&g.status==='FAIL'));
});
