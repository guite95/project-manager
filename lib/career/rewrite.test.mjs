import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,decisions} from './fixtures.mjs';
import {evaluate} from './evaluator.ts';
const api=await import('./rewrite.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
async function setup(){const x=fixture();const r=await evaluate(x,{sessionId:'session',draftVersion:1,provider:async req=>decisions(req.questions,2)});return {x,r,request:{sessionId:'session',basedOnEvaluationId:r.identity.evaluationId,expectedDraftVersion:1,expectedDraftHash:r.identity.draftHash,replacements:[{questionId:'q1',paragraphId:'p1',expectedText:x.answers[0].text,replacementText:'팀의 API 오류를 분석했습니다.',findingIds:r.rewriteTargets[0].findingIds}]}};}
test('해시·평가 ID·기존 원문이 일치하는 부분 수정만 적용한다',async()=>{
  assert.equal(typeof api.applyRewrite,'function');
  const {x,r,request}=await setup();const updated=api.applyRewrite(x,r,request);
  assert.equal(updated.answers[0].text,'팀의 API 오류를 분석했습니다.');assert.equal(x.answers[0].text,'팀에서 API 오류를 분석했습니다.');
  for(const patch of [{expectedDraftHash:'sha256:bad'},{expectedDraftVersion:2},{basedOnEvaluationId:'old'}])assert.throws(()=>api.applyRewrite(x,r,{...request,...patch}));
});
test('수정 범위 밖·중복 교체·보존 문자열 삭제·진단 전용은 거부한다',async()=>{
  assert.equal(typeof api.applyRewrite,'function');
  const {x,r,request}=await setup();
  assert.throws(()=>api.applyRewrite({...x,mode:'DIAGNOSE'},r,request));
  assert.throws(()=>api.applyRewrite(x,r,{...request,replacements:[...request.replacements,...request.replacements]}));
  assert.throws(()=>api.applyRewrite({...x,editScope:{...x.editScope,preserveExact:['팀에서']}},r,request));
  assert.throws(()=>api.applyRewrite(x,r,{...request,replacements:[{...request.replacements[0],findingIds:[]}]}));
});

test('문단 범위 수정으로 빈 줄 분할을 추가하여 구조 변경 제한을 우회하지 않는다',async()=>{
  const {x,r,request}=await setup();request.replacements[0].replacementText='팀에서\n\nAPI 오류를 분석했습니다.';
  assert.throws(()=>api.applyRewrite(x,r,request),/RESTRUCTURE_NOT_ALLOWED/);
});
test('전체 회귀에서 새 필수 실패·지표 하락·정체이면 후보 채택을 보류한다',async()=>{
  assert.equal(typeof api.compareCandidate,'function');
  const {r}=await setup();const next=structuredClone(r);next.identity.evaluationId='next';next.status='PASS';
  next.metrics[0].score=1;assert.equal(api.compareCandidate(r,next).accepted,false);
  next.metrics[0].score=2;assert.equal(api.compareCandidate(r,next).result.stopReason,'NO_MEANINGFUL_IMPROVEMENT');
  next.gates[0].status='FAIL';assert.equal(api.compareCandidate(r,next).accepted,false);
});

test('검사 입력 구성 등 평가 버전이 달라진 결과는 개선 비교에서 채택하지 않는다',async()=>{
  const {r}=await setup();
  for(const key of ['rubricVersion','policyVersion','promptVersion','segmentationVersion']){
    const next=structuredClone(r);next.status='PASS';next.identity[key]='previous-version';
    next.questionScores[0].score100=100;
    const compared=api.compareCandidate(r,next);
    assert.equal(compared.accepted,false);assert.equal(compared.result.stopReason,'COMPARISON_CONTEXT_CHANGED');
    assert.equal(compared.result.status,'REVIEW');assert.deepEqual(compared.result.rewriteTargets,[]);
  }
});
