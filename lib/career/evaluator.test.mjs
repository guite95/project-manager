import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,decisions} from './fixtures.mjs';
import {MAX_REQUEST_BYTES,requestBytes} from './jev.ts';
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

function largeFixture(){
  const x=fixture();
  x.sources[0].text+=' 정정과 조건을 포함한 전체 문맥: '+'문맥'.repeat(1400);
  const jdText='API 분석 등 직무 요건.';
  x.sources.push({...x.sources[0],id:'jd-source',origin:'JD_COPY',text:jdText});
  x.jd={sourceIds:['jd-source'],completeness:'COMPLETE',eligibilityLogic:null,requirements:Array.from({length:8},(_,i)=>({
    id:`req-${i}`,kind:'DUTY',priority:'REQUIRED',text:`API 분석 업무 ${i}`,
    sourceRef:{sourceId:'jd-source',start:0,end:Array.from(jdText).length,quote:jdText},
  }))};
  x.questions=Array.from({length:4},(_,i)=>({...x.questions[0],id:`q${i+1}`,prompt:`문항 ${i+1}: `+'문항 설명. '.repeat(80),relevantRequirementIds:[`req-${i*2}`,`req-${i*2+1}`]}));
  x.answers=x.questions.map((q,i)=>{
    const text=Array.from(`문항 ${i+1}에서 API 오류 분석 과정을 설명합니다. `+'가'.repeat(1000)).slice(0,1000).join('');
    return {questionId:q.id,text,paragraphs:[{...x.answers[0].paragraphs[0],id:`p${i+1}`,end:1000,requirementIds:q.relevantRequirementIds}]};
  });
  x.editScope.questionIds=x.questions.map(q=>q.id);
  return x;
}

test('네 문항 1,000자 평가를 검사별로 묶어 원문 보존 및 46개 검사 완료를 확인한다',async()=>{
  const x=largeFixture(),requests=[];
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{
    requests.push(req);assert.ok(requestBytes(req)<=MAX_REQUEST_BYTES);
    const entries=Object.entries(req.questions);
    if(entries.some(([id])=>id.startsWith('match:'))){
      assert.deepEqual(req.state.requirements.map(row=>row.id),entries.map(([id])=>id.split(':').at(-1)));
      assert.equal(req.state.answers,undefined);
    }
    for(const [id] of entries){
      const [kind,questionId,,name]=id.split(':');
      if(questionId!=='all'){
        assert.deepEqual(req.state.answers.find(a=>a.questionId===questionId),x.answers.find(a=>a.questionId===questionId));
        assert.deepEqual(req.state.questions.find(q=>q.id===questionId),x.questions.find(q=>q.id===questionId));
      }
      if(kind==='evidence'||name==='G2'||kind==='metric'&&name==='Q5'){
        assert.deepEqual(req.state.facts,x.facts);assert.deepEqual(req.state.sources,[x.sources[0]]);
      }
      if(kind==='gate'&&name==='G3')assert.deepEqual(req.state.answers,x.answers);
      if(kind==='metric'&&name==='Q2')assert.ok(req.state.jd.requirements.some(row=>x.questions.find(q=>q.id===questionId).relevantRequirementIds.includes(row.id)));
    }
    return decisions(req.questions);
  }});
  const firstBodyQuestion=requests.flatMap(req=>Object.entries(req.questions)).find(([id])=>id.startsWith('metric:'));
  const oldState={facts:x.facts,sources:[x.sources[0]],jd:x.jd,questions:x.questions,answers:x.answers,styleReferences:[],editScope:x.editScope};
  assert.ok(requestBytes({state:oldState,questions:Object.fromEntries([firstBodyQuestion])})>MAX_REQUEST_BYTES);
  assert.equal(r.status,'PASS');assert.equal(r.stopReason,null);
  assert.equal(r.coverage.plannedCheckIds.length,46);assert.equal(r.coverage.completedCheckIds.length,46);
  assert.deepEqual(r.coverage.missingCheckIds,[]);assert.equal(r.coverage.truncated,false);
  assert.ok(r.counters.providerAttempts<=12);assert.ok(r.questionScores.every(q=>q.score100===100));
  assert.ok(requests.some(req=>req.state.answers?.length<4));
});

test('문항 간 모순의 문단 진단에도 다른 문항 전체를 보존한다',async()=>{
  const x=largeFixture();let diagnoses=0;
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{
    assert.ok(requestBytes(req)<=MAX_REQUEST_BYTES);
    const out=decisions(req.questions);
    for(const id of Object.keys(req.questions))if(id.endsWith(':G3')){
      if(id==='gate:all:whole:G3'){
        assert.deepEqual(req.state.answers,x.answers);
        out.answers[id]={type:'choice',choice:'FAIL',confidence:1,probabilities:{PASS:0,FAIL:1,UNKNOWN:0}};
      }else{
        diagnoses++;assert.deepEqual(req.state.otherAnswersForContradiction,x.answers.filter(a=>a.questionId!==req.state.question.id));
        assert.deepEqual(req.state.answer,x.answers.find(a=>a.questionId===req.state.question.id));
        assert.equal(req.state.sources,undefined);assert.equal(req.state.jd,undefined);
      }
    }
    return out;
  }});
  assert.equal(diagnoses,4);assert.equal(r.coverage.missingCheckIds.length,0);assert.notEqual(r.status,'PASS');
});

test('네 문항 1,800자의 내부 모순 문단 진단도 원문을 보존하고 입력 한도 안에서 완료한다',async()=>{
  const x=fixture();
  x.questions=Array.from({length:4},(_,i)=>({...x.questions[0],id:`q${i+1}`}));
  x.answers=x.questions.map((q,i)=>({questionId:q.id,text:Array.from(`문항 ${i+1}의 원고입니다. `+'가'.repeat(1800)).slice(0,1800).join(''),paragraphs:[{...x.answers[0].paragraphs[0],id:`p${i+1}`,end:1800}]}));
  x.editScope.questionIds=x.questions.map(q=>q.id);
  const requests=[];let diagnoses=0;
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{
    requests.push(req);assert.ok(requestBytes(req)<=MAX_REQUEST_BYTES);
    const out=decisions(req.questions);
    for(const id of Object.keys(req.questions))if(id.endsWith(':G3')){
      if(id==='gate:all:whole:G3')out.answers[id]={type:'choice',choice:'FAIL',confidence:1,probabilities:{PASS:0,FAIL:1,UNKNOWN:0}};
      else diagnoses++;
    }
    return out;
  }});
  assert.equal(diagnoses,4);
  assert.equal(r.coverage.plannedCheckIds.length,38);assert.equal(r.coverage.completedCheckIds.length,38);
  assert.deepEqual(r.coverage.missingCheckIds,[]);assert.equal(r.coverage.truncated,false);assert.equal(r.stopReason,null);
  assert.notEqual(r.status,'PASS');assert.ok(r.counters.providerAttempts<=12);
  for(const req of requests.filter(req=>req.state.focus)){
    const own=x.answers.find(a=>a.questionId===req.state.question.id);
    assert.deepEqual(req.state.answer,own);
    assert.deepEqual(req.state.otherAnswersForContradiction,x.answers.filter(a=>a.questionId!==own.questionId));
    assert.deepEqual(req.state.focus.current,own.paragraphs[0]);
  }
});

test('원고 자체가 단일 내부 모순 검사의 한도를 넘으면 누락을 남기고 통과시키지 않는다',async()=>{
  const x=fixture();x.sources=[];x.facts=[];
  x.questions=Array.from({length:4},(_,i)=>({...x.questions[0],id:`q${i+1}`}));
  x.answers=x.questions.map((q,i)=>({questionId:q.id,text:'가'.repeat(2500),paragraphs:[{id:`p${i+1}`,start:0,end:2500,role:'행동',factIds:[],requirementIds:[]}]}));
  x.editScope.questionIds=x.questions.map(q=>q.id);
  const r=await api.evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>{
    assert.ok(requestBytes(req)<=MAX_REQUEST_BYTES);assert.ok(!Object.keys(req.questions).includes('gate:all:whole:G3'));return decisions(req.questions);
  }});
  assert.equal(r.status,'INCOMPLETE');assert.equal(r.stopReason,'INPUT_LIMIT');
  assert.deepEqual(r.coverage.missingCheckIds,['gate:all:whole:G3']);assert.equal(r.coverage.truncated,false);
  assert.ok(r.questionScores.every(q=>q.score100===null));
});
