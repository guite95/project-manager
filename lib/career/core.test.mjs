import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture} from './fixtures.mjs';
const api = await import('./core.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND') return {}; throw e;});

test('인용은 코드포인트 원문과 일치하고 빠진 문단이나 위조 근거를 거부한다',()=>{
  assert.equal(typeof api.parseInput,'function');
  assert.deepEqual(api.parseInput(fixture()),fixture());
  for(const mutate of [x=>x.facts[0].sourceRefs[0].quote='위조',x=>x.answers[0].paragraphs[0].end=3,x=>x.answers[0].paragraphs[0].factIds=['missing'],x=>x.editScope.questionIds=[],x=>x.model='attacker']) {
    const x=fixture();mutate(x);assert.throws(()=>api.parseInput(x));
  }
});
test('폐기한 사실과 JD 불완전성은 확정 근거로 승격하지 않는다',()=>{
  assert.equal(typeof api.parseInput,'function');
  const x=fixture();x.facts.push({...x.facts[0],id:'f2',supersedes:['f1']});
  assert.throws(()=>api.parseInput(x));
  x.facts.pop();x.jd.requirements=[{id:'r1',kind:'ELIGIBILITY',priority:'REQUIRED',text:'임의',sourceRef:x.facts[0].sourceRefs[0]}];
  assert.throws(()=>api.parseInput(x));
});

test('사실 대체 관계 순환과 프로토타입 이름은 안전하게 처리한다',()=>{
  const x=fixture();x.facts[0].supersedes=['f1'];assert.throws(()=>api.parseInput(x),/FACT_CYCLE/);
  assert.equal(api.matchLogic({op:'REF',requirementId:'constructor'},{}),'UNKNOWN');
});
test('Python whitespace 호환 글자 수와 줄바꿈 규칙을 결정적으로 계산한다',()=>{
  assert.equal(typeof api.auditText,'function');
  const text='가😀 \r\n\u001c\u0085\ufeff';
  assert.deepEqual(api.auditText(text,'PRESERVE'),{CODEPOINTS:8,NO_ASCII_SPACES:7,NO_WHITESPACE:3,UTF8_BYTES:16,UTF16_UNITS:9});
  assert.equal(api.auditText('a\r\nb\rc\n','LF').CODEPOINTS,6);
  assert.equal(api.auditText('a\r\nb\rc\n','REMOVE').CODEPOINTS,3);
});
test('초안 해시는 공백 변경을 감지하고 context 해시는 표현 수정과 분리한다',()=>{
  assert.equal(typeof api.identify,'function');
  const x=fixture(), a=api.identify(x,'session',1), y=fixture();
  y.answers[0].text+=' '; const b=api.identify(y,'session',2);
  assert.notEqual(a.draftHash,b.draftHash); assert.equal(a.contextHash,b.contextHash);
  y.sources[0].revision=2; assert.notEqual(a.contextHash,api.identify(y,'session',2).contextHash);
});
test('지원 조건 ALL/ANY는 불명과 대체 인정 조건을 보존한다',()=>{
  assert.equal(typeof api.matchLogic,'function');
  const expr={op:'ANY',children:[{op:'REF',requirementId:'r1'},{op:'REF',requirementId:'r2'}]};
  assert.equal(api.matchLogic(expr,{r1:'MET',r2:'UNKNOWN'}),'MET');
  assert.equal(api.matchLogic({...expr,op:'ALL'},{r1:'MET',r2:'UNKNOWN'}),'UNKNOWN');
  assert.equal(api.matchLogic({...expr,op:'ALL'},{r1:'NOT_MET',r2:'UNKNOWN'}),'NOT_MET');
});
