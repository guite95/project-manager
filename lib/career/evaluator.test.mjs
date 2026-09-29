import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,decisions} from './fixtures.mjs';
const api=await import('./evaluator.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const provider=score=>async request=>decisions(request.questions,score);
test('전체 통과와 JD 적용 제외: 문단 진단을 총점에 중복 반영하지 않는다',async()=>{
  assert.equal(typeof api.evaluate,'function');
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:provider(4)});
  assert.equal(r.status,'PASS');assert.equal(r.questionScores[0].score100,100);
  assert.deepEqual(r.questionScores[0].excludedMetricIds,['Q2']);assert.equal(r.counters.providerAttempts,2);
  assert.equal(r.coverage.missingCheckIds.length,0);
});
test('경계 점수에는 자동 수정 지시나 반복 호출을 내보내지 않는다',async()=>{
  assert.equal(typeof api.evaluate,'function');
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:provider(3)});
  assert.equal(r.status,'REVIEW');assert.equal(r.counters.providerAttempts,2);assert.deepEqual(r.rewriteTargets,[]);
});
test('미달 문단을 좁혀 검사하며 허용된 위치만 수정 대상으로 반환한다',async()=>{
  let call=0;
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:async request=>{
    if(++call===3){assert.equal(request.state.focus.current.text,'팀에서 API 오류를 분석했습니다.');assert.equal(request.state.focus.previous,null);}
    return decisions(request.questions,2);
  }});
  assert.equal(r.status,'REVISE');assert.equal(r.counters.providerAttempts,3);
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
  x.facts[0].sourceRefs[0]={sourceId:'s1',start:0,end:Array.from(x.sources[0].text).length,quote:x.sources[0].text};
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

test('자료가 없으면 사실성은 UNKNOWN이며 사실성 모델 질문을 보내지 않는다',async()=>{
  const x=fixture();x.sources=[];x.facts=[];x.answers[0].paragraphs[0].factIds=[];
  const sent=[];
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{sent.push(...Object.keys(req.questions));return decisions(req.questions);}});
  assert.equal(r.status,'NEEDS_INPUT');
  assert.ok(r.gates.some(g=>g.gateId==='G2'&&g.status==='UNKNOWN'&&g.reasonCode==='EVIDENCE_MISSING'));
  assert.ok(sent.every(id=>!id.endsWith(':G2')));
});
test('출처 충돌과 불확실한 출처 판정은 사실성 위반/통과로 확정하지 않는다',async()=>{
  for(const [choice,confidence] of [['CONFLICT',1],['AVAILABLE',.4]]){
    const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:async req=>{
      const out=decisions(req.questions);
      for(const [id,q] of Object.entries(req.questions))if(q.criteria.AVAILABLE){out.answers[id]={type:'choice',choice,confidence,probabilities:{AVAILABLE:choice==='AVAILABLE'?1:0,MISSING:0,CONFLICT:choice==='CONFLICT'?1:0}};}
      return out;
    }});
    assert.ok(r.gates.some(g=>g.gateId==='G2'&&g.status==='UNKNOWN'));
    assert.notEqual(r.status,'PASS');assert.deepEqual(r.rewriteTargets,[]);
  }
});
test('JD 경험 판정 입력은 원고를 포함하지 않고 폐기/미확인 사실도 제외한다',async()=>{
  const x=fixture();x.jd={sourceIds:['s1'],completeness:'COMPLETE',requirements:[{id:'r1',kind:'DUTY',priority:'REQUIRED',text:'API 분석',sourceRef:x.facts[0].sourceRefs[0]}],eligibilityLogic:null};
  x.questions[0].relevantRequirementIds=['r1'];
  const requests=[];
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{requests.push(req);return decisions(req.questions);}});
  const match=requests.find(req=>Object.keys(req.questions).includes('match:all:whole:r1'));
  assert.ok(match);assert.equal(match.state.answers,undefined);assert.equal(match.state.editScope,undefined);
  assert.ok(Object.keys(match.questions).every(id=>id==='match:all:whole:r1'));
  assert.equal(r.requirementMatches[0].status,'MET');
  const unavailable=fixture();unavailable.facts[0].confirmation='UNCONFIRMED';unavailable.answers[0].paragraphs[0].factIds=[];
  const withheld=await api.evaluate(unavailable,{sessionId:'session',draftVersion:1,provider:async req=>{
    assert.ok(!JSON.stringify(req.state.facts??[]).includes('UNCONFIRMED'));return decisions(req.questions);
  }});
  assert.ok(withheld.gates.some(g=>g.gateId==='G2'&&g.status==='UNKNOWN'));
});
test('형식 조건이 없으면 형식 위반 질문을 생략한다',async()=>{
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:async req=>{
    assert.ok(Object.keys(req.questions).every(id=>!id.endsWith(':G5')));return decisions(req.questions);
  }});
  assert.ok(r.gates.some(g=>g.gateId==='G5'&&g.status==='NOT_APPLICABLE'));
});
test('응답 검증 실패에도 유효한 비용과 요청 ID를 결과에 남긴다',async()=>{
  const r=await api.evaluate(fixture(),{sessionId:'session',draftVersion:1,provider:async req=>{
    const out=decisions(req.questions);out.answers={};return out;
  }});
  assert.equal(r.status,'ERROR');assert.equal(r.requests[0]?.usage.cost,.001);
  assert.equal(r.requests[0]?.requestId,'test-request');assert.equal(r.coverage.completedCheckIds.length,0);
});
test('사실 인용 밖의 원자료 맥락도 출처 충돌 검사에 전달한다',async()=>{
  const x=fixture();x.sources[0].text+=' 같은 사건의 정정 기록: API 분석은 아직 시작하지 않았다.';
  const requests=[];
  await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{requests.push(req);return decisions(req.questions);}});
  assert.ok(JSON.stringify(requests[0].state.sources).includes('아직 시작하지 않았다'));
  assert.equal(requests[0].state.answers,undefined);
});
test('요건 ID가 evidence/G3/voice_alignment여도 coverage가 다른 검사와 충돌하지 않는다',async()=>{
  for(const id of ['evidence','G3','voice_alignment']){
    const x=fixture();x.jd={sourceIds:['s1'],completeness:'COMPLETE',requirements:[{id,kind:'DUTY',priority:'REQUIRED',text:'API 분석',sourceRef:x.facts[0].sourceRefs[0]}],eligibilityLogic:null};
    let calls=0;
    const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{if(++calls===2)throw new Error('offline');return decisions(req.questions);}});
    assert.equal(new Set(r.coverage.plannedCheckIds).size,r.coverage.plannedCheckIds.length);
    assert.ok(r.coverage.missingCheckIds.some(key=>key.endsWith(`:${id}`)));
  }
});
test('낮은 확신도의 JD 요건을 확정 지원 자격이나 전체 PASS로 승격하지 않는다',async()=>{
  const x=fixture();x.jd={sourceIds:['s1'],completeness:'COMPLETE',requirements:[{id:'r1',kind:'ELIGIBILITY',priority:'REQUIRED',text:'API 경험',sourceRef:x.facts[0].sourceRefs[0]}],eligibilityLogic:{op:'REF',requirementId:'r1'}};
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{
    const out=decisions(req.questions);for(const [id,a] of Object.entries(out.answers))if(id.startsWith('match:')){a.confidence=.3;a.probabilities={MET:.5,PARTIAL:.3,NOT_MET:.1,UNKNOWN:.1};}return out;
  }});
  assert.equal(r.eligibility,'UNKNOWN');assert.equal(r.status,'REVIEW');assert.deepEqual(r.rewriteTargets,[]);
});
