import {CareerError, auditText, identify, parseInput, slice, target, matchLogic, type EvaluationInput, type Target, type Match} from './core.ts';
import {MAX_REQUEST_BYTES, parseDecisions, requestBytes, type DecisionProvider, type DecisionQuestion} from './jev.ts';
import {RUBRIC, GUARDS, SYSTEM_INSTRUCTIONS} from './rubric.ts';

type Metric={metricId:string;target:Target;status:'SCORED'|'NOT_APPLICABLE'|'UNKNOWN'|'ERROR';score:number|null;confidence:number|null;probabilities:Record<string,number>|null;reasonCode:string|null};
type Gate={gateId:string;target:Target;status:'PASS'|'FAIL'|'UNKNOWN'|'NOT_APPLICABLE'|'ERROR';origin:'DETERMINISTIC'|'JEV';confidence:number|null;reasonCode:string|null};
export type Finding={id:string;metricOrGateId:string;target:Target;quote:string|null;factIds:string[];requirementIds:string[];explanation:string;explanationOrigin:'RULE_TEMPLATE';remedy:'REWRITE'|'ASK_USER'|'KEEP'|'REVIEW'};
export type EvaluationResult={
  identity:ReturnType<typeof identify>;status:'PASS'|'REVISE'|'NEEDS_INPUT'|'REVIEW'|'INCOMPLETE'|'ERROR';
  coverage:{plannedCheckIds:string[];completedCheckIds:string[];missingCheckIds:string[];truncated:boolean};
  requirementMatches:{requirementId:string;status:Match;factIds:string[];confidence:number|null}[];eligibility:Match;
  gates:Gate[];metrics:Metric[];questionScores:{questionId:string;score100:number|null;excludedMetricIds:string[]}[];
  findings:Finding[];rewriteTargets:{target:Target;findingIds:string[]}[];
  counters:{rewriteCandidates:number;providerAttempts:number};stopReason:string|null;
  requests:{checkIds:string[];requestId:string;model:string;usage:{input_tokens:number;output_tokens:number;cost:number}}[];
};
type Check={id:string;kind:'metric'|'gate'|'match';name:string;target:Target;question:DecisionQuestion};
type Options={sessionId:string;draftVersion:number;provider:DecisionProvider;providerAttempts?:number;beforeAttempt?:()=>Promise<void>;onProgress?:(result:EvaluationResult)=>Promise<void>};
const gateChoice={PASS:'제공된 자료 범위에서 조건 충족',FAIL:'명확한 위반이 있고 자료 범위 안에서 수정 가능',UNKNOWN:'자료 부족 또는 출처 충돌로 판단 불가'};

export async function evaluate(value:unknown,options:Options):Promise<EvaluationResult> {
  const x=parseInput(value);
  const r:EvaluationResult={identity:identify(x,options.sessionId,options.draftVersion),status:'INCOMPLETE',coverage:{plannedCheckIds:[],completedCheckIds:[],missingCheckIds:[],truncated:false},requirementMatches:[],eligibility:'UNKNOWN',gates:[],metrics:[],questionScores:[],findings:[],rewriteTargets:[],counters:{rewriteCandidates:options.draftVersion-1,providerAttempts:options.providerAttempts??0},stopReason:null,requests:[]};
  const makeCheck=(kind:Check['kind'],name:string,t:Target,instructions:string,criteria?:string[]):Check=>({id:`${t.questionId??'all'}:${t.paragraphId??'whole'}:${name}`,kind,name,target:t,question:criteria?{type:'score',instructions:SYSTEM_INSTRUCTIONS+instructions,criteria}:{type:'choice',instructions:SYSTEM_INSTRUCTIONS+instructions,criteria:gateChoice}});
  const checks:Check[]=[];
  if(x.editScope.preserveExact.some(exact=>!x.answers.some(a=>a.text.includes(exact))))r.gates.push({gateId:'G5',target:target(),status:'UNKNOWN',origin:'DETERMINISTIC',confidence:null,reasonCode:'PRESERVE_TEXT_NOT_FOUND'});
  for(const q of x.questions) {
    const a=x.answers.find(a=>a.questionId===q.id)!;
    const t=target(q.id);
    for(const metric of RUBRIC) {
      if(metric.id==='Q2' && (x.jd.completeness==='PARTIAL'||x.jd.completeness==='ABSENT'||!q.relevantRequirementIds.length)) {
        r.metrics.push({metricId:metric.id,target:t,status:x.jd.completeness==='PARTIAL'?'UNKNOWN':'NOT_APPLICABLE',score:null,confidence:null,probabilities:null,reasonCode:x.jd.completeness==='PARTIAL'?'JD_PARTIAL':'JD_NOT_RELEVANT'});
      } else checks.push(makeCheck('metric',metric.id,t,`문항 ${q.id} 전체의 ${metric.name}. 관련 JD만 고려.`,metric.anchors));
    }
    for(const id of ['G1','G2','G5']) checks.push(makeCheck('gate',id,t,`문항 ${q.id}. ${GUARDS[id]}`));
    const rule=q.lengthRule, count=rule?auditText(a.text,rule.newlines)[rule.metric]:null;
    r.gates.push({gateId:'G4',target:t,status:!rule?'NOT_APPLICABLE':rule.origin==='ASSUMED'?'UNKNOWN':(rule.minimum!==null&&count!<rule.minimum || rule.maximum!==null&&count!>rule.maximum)?'FAIL':'PASS',origin:'DETERMINISTIC',confidence:null,reasonCode:!rule?'NO_LENGTH_RULE':rule.origin==='ASSUMED'?'ASSUMED_LENGTH_RULE':`COUNT_${count}`});
    for(const p of a.paragraphs)if(x.editScope.forbiddenClaims.some(claim=>slice(a.text,p.start,p.end).includes(claim)))r.gates.push({gateId:'G5',target:target(a.questionId,p.id,p.start,p.end),status:'FAIL',origin:'DETERMINISTIC',confidence:null,reasonCode:'FORBIDDEN_EXACT_TEXT'});
  }
  checks.push(makeCheck('gate','G3',target(),GUARDS.G3));
  for(const req of x.jd.requirements) {
    const c=makeCheck('match',req.id,target(),`요건 ${req.id}와 확인된 사실 원문을 대조한다. 글의 표현이 아닌 실제 지원 조건/경험 부합 여부. 초안은 증거가 아니다. 언급 없음은 UNKNOWN, 확인된 사실이 부족함을 증명할 때만 NOT_MET.`);
    c.question={...c.question,type:'choice',criteria:{MET:'근거가 요건을 충족',PARTIAL:'일부 충족',NOT_MET:'확인된 사실이 조건에 미달',UNKNOWN:'판단할 근거 부족'}};checks.push(c);
  }
  if(x.styleReferenceSourceIds.length) checks.push(makeCheck('metric','voice_alignment',target(),'STYLE_REFERENCE와 원고의 어조/표현 습관 부합을 참고 진단한다. 사실의 출처로 사용하지 않는다.',['전혀 다름','큰 차이','일부 유사','대체로 유사','일관됨']));
  const state={sources:x.sources,jd:x.jd,facts:x.facts,questions:x.questions,answers:x.answers,styleReferenceSourceIds:x.styleReferenceSourceIds,editScope:x.editScope};
  let failed=false,limited=false;
  const reportProgress=async()=>{
    r.coverage.missingCheckIds=r.coverage.plannedCheckIds.filter(id=>!r.coverage.completedCheckIds.includes(id));
    await options.onProgress?.(structuredClone(r));
  };
  const run=async(plan:Check[],requestState:unknown,registerPlan=true)=>{
    if(registerPlan){r.coverage.plannedCheckIds.push(...plan.map(c=>c.id));await reportProgress();}
    let pending=[...plan];
    while(pending.length && !failed && !limited) {
      const batch:Check[]=[];
      while(pending.length && batch.length<16) {
        const candidate=[...batch,pending[0]], questions=Object.fromEntries(candidate.map(c=>[c.id,c.question]));
        if(requestBytes({state:requestState,questions})>MAX_REQUEST_BYTES)break;
        batch.push(pending.shift()!);
      }
      if(!batch.length || r.counters.providerAttempts>=12) {limited=true;r.stopReason=!batch.length?'INPUT_LIMIT':'CALL_LIMIT';break;}
      const questions=Object.fromEntries(batch.map(c=>[c.id,c.question]));
      try {
        await options.beforeAttempt?.(); r.counters.providerAttempts++;
        const result=parseDecisions(await options.provider({state:requestState,questions}),questions);
        r.identity.resolvedModels=Array.from(new Set([...r.identity.resolvedModels,result.model]));
        r.requests.push({checkIds:batch.map(c=>c.id),requestId:result.id,model:result.model,usage:result.usage});
        for(const c of batch) {
          const a=result.answers[c.id];r.coverage.completedCheckIds.push(c.id);
          if(c.kind==='metric') r.metrics.push({metricId:c.name,target:c.target,status:a.confidence===null?'UNKNOWN':'SCORED',score:a.confidence===null?null:a.score,confidence:a.confidence,probabilities:a.probabilities,reasonCode:a.confidence===null?'MISSING_CONFIDENCE':null});
          else if(c.kind==='gate') r.gates.push({gateId:c.name,target:c.target,status:a.confidence===null?'UNKNOWN':a.choice as Gate['status'],origin:'JEV',confidence:a.confidence,reasonCode:a.confidence===null?'MISSING_CONFIDENCE':null});
          else r.requirementMatches.push({requirementId:c.name,status:a.confidence===null?'UNKNOWN':a.choice as Match,factIds:[],confidence:a.confidence});
        }
        await reportProgress();
      } catch(error) {failed=true;r.stopReason=error instanceof CareerError?error.code:'PROVIDER_UNAVAILABLE';}
    }
  };
  await run(checks,state);
  // Diagnose confidently failing concepts with the original target and adjacent paragraphs.
  if(!failed&&!limited) {
    const partialPlans:{checks:Check[];state:unknown}[]=[];
    for(const a of x.answers) {
      const bad=r.metrics.filter(m=>m.target.questionId===a.questionId&&m.status==='SCORED'&&m.score!<2.8&&m.confidence!>=0.7);
      const badGates=r.gates.filter(g=>(g.target.questionId===a.questionId||g.gateId==='G3')&&g.status==='FAIL'&&g.confidence!>=0.7);
      for(const p of a.paragraphs) {
        const partial:Check[]=[];
        for(const m of bad) {const rubric=RUBRIC.find(q=>q.id===m.metricId)!;partial.push(makeCheck('metric',m.metricId,target(a.questionId,p.id,p.start,p.end),`문항 ${a.questionId}의 문단 ${p.id}가 ${rubric.name} 미달에 기여하는지 진단. 앞뒤 문단과 전체 문항 원문을 함께 읽고 문단 자체에 모든 요소를 요구하지 않는다.`,rubric.anchors));}
        for(const g of badGates) partial.push(makeCheck('gate',g.gateId,target(a.questionId,p.id,p.start,p.end),`문항 ${a.questionId} 문단 ${p.id}를 인접 문단 및 전체 맥락으로 확인. ${GUARDS[g.gateId]}`));
        if(partial.length) {
          const index=a.paragraphs.indexOf(p),q=x.questions.find(q=>q.id===a.questionId)!;
          const segment=(i:number)=>{const paragraph=a.paragraphs[i];return paragraph?{...paragraph,text:slice(a.text,paragraph.start,paragraph.end)}:null;};
          const focus={current:segment(index),previous:segment(index-1),next:segment(index+1)};
          const relatedIds=new Set([...(focus.current?.factIds??[]),...(focus.previous?.factIds??[]),...(focus.next?.factIds??[])]);
          const facts=x.facts.filter(f=>relatedIds.has(f.id));
          const requirementIds=new Set([...q.relevantRequirementIds,...p.requirementIds]);
          const requirements=x.jd.requirements.filter(req=>requirementIds.has(req.id));
          const sourceIds=new Set([...facts.flatMap(f=>f.sourceRefs.map(ref=>ref.sourceId)),...requirements.map(req=>req.sourceRef.sourceId),...x.styleReferenceSourceIds]);
          partialPlans.push({checks:partial,state:{question:q,focus,paragraphOutline:a.paragraphs.map(({id,role})=>({id,role})),facts,sources:x.sources.filter(s=>sourceIds.has(s.id)),jd:{completeness:x.jd.completeness,requirements},editScope:x.editScope,...(badGates.some(g=>g.gateId==='G3')?{wholeDraftForContradiction:state}:{} )}});
        }
      }
    }
    r.coverage.plannedCheckIds.push(...partialPlans.flatMap(plan=>plan.checks.map(c=>c.id)));
    await reportProgress();
    for(const plan of partialPlans){if(failed||limited)break;await run(plan.checks,plan.state,false);}
  }
  r.coverage.missingCheckIds=r.coverage.plannedCheckIds.filter(id=>!r.coverage.completedCheckIds.includes(id));
  r.gates.push({gateId:'G6',target:target(),status:r.coverage.missingCheckIds.length?'UNKNOWN':'PASS',origin:'DETERMINISTIC',confidence:null,reasonCode:r.coverage.missingCheckIds.length?'CHECKS_MISSING':null});
  r.eligibility=matchLogic(x.jd.eligibilityLogic,Object.fromEntries(r.requirementMatches.map(m=>[m.requirementId,m.status])));
  for(const q of x.questions) {
    const metrics=r.metrics.filter(m=>m.target.questionId===q.id&&!m.target.paragraphId&&RUBRIC.some(q=>q.id===m.metricId));
    const applicable=metrics.filter(m=>m.status!=='NOT_APPLICABLE');
    const complete=metrics.length===7 && applicable.every(m=>m.status==='SCORED')&&!r.coverage.missingCheckIds.length;
    r.questionScores.push({questionId:q.id,score100:complete?25*applicable.reduce((n,m)=>n+RUBRIC.find(q=>q.id===m.metricId)!.weight*m.score!,0)/applicable.reduce((n,m)=>n+RUBRIC.find(q=>q.id===m.metricId)!.weight,0):null,excludedMetricIds:metrics.filter(m=>m.status==='NOT_APPLICABLE').map(m=>m.metricId)});
  }
  const observations=[...r.metrics.map(m=>({id:m.metricId,target:m.target,bad:m.status==='SCORED'&&m.score!<2.8,unknown:m.status==='UNKNOWN',review:m.confidence!==null&&m.confidence<.7||m.score!==null&&m.score>=2.8&&m.score<=3.2,reason:m.reasonCode})),...r.gates.filter(g=>g.gateId!=='G6').map(g=>({id:g.gateId,target:g.target,bad:g.status==='FAIL',unknown:g.status==='UNKNOWN',review:g.confidence!==null&&g.confidence<.7,reason:g.reasonCode}))];
  for(const o of observations.filter(o=>o.bad||o.unknown||o.review)) {
    const a=x.answers.find(a=>a.questionId===o.target.questionId), p=a?.paragraphs.find(p=>p.id===o.target.paragraphId);
    const allowed=Boolean(a&&x.editScope.questionIds.includes(a.questionId)&&(p?(!x.editScope.paragraphIds.length||x.editScope.paragraphIds.includes(p.id)):!x.editScope.paragraphIds.length));
    const localizable=Boolean(p)||o.id==='G4';
    const remedy=o.unknown?'ASK_USER':o.review?'REVIEW':allowed&&localizable?'REWRITE':'REVIEW';
    const finding:Finding={id:`finding-${r.findings.length+1}`,metricOrGateId:o.id,target:o.target,quote:p&&a?slice(a.text,p.start,p.end):null,factIds:p?.factIds??[],requirementIds:p?.requirementIds??[],explanation:`${o.id}: ${o.unknown?'자료 또는 계산 규칙 확인 필요':o.review?'경계 점수 또는 낮은 확신도':'기준 미달'}. 원문을 대조해 수정 이유를 확인하세요.`,explanationOrigin:'RULE_TEMPLATE',remedy};
    r.findings.push(finding);
    if(remedy==='REWRITE') r.rewriteTargets.push({target:o.target,findingIds:[finding.id]});
  }
  const needsInput=observations.some(o=>o.unknown&&o.reason!=='MISSING_CONFIDENCE');
  const review=observations.some(o=>o.review||o.reason==='MISSING_CONFIDENCE')||r.identity.resolvedModels.length>1;
  const bad=observations.some(o=>o.bad);
  r.status=failed?'ERROR':r.coverage.missingCheckIds.length?'INCOMPLETE':needsInput?'NEEDS_INPUT':review?'REVIEW':!bad?'PASS':r.counters.rewriteCandidates>=2||r.counters.providerAttempts>=12||!r.rewriteTargets.length?'REVIEW':'REVISE';
  if(r.status!=='REVISE')r.rewriteTargets=[];
  return r;
}
