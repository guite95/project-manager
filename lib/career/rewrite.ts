import {z} from 'zod';
import {fail, identify, parseInput, slice, VERSIONS, type EvaluationInput} from './core.ts';
import type {EvaluationResult} from './evaluator.ts';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const rewriteSchema=z.strictObject({sessionId:id,basedOnEvaluationId:id,expectedDraftVersion:z.number().int().positive(),expectedDraftHash:z.string().regex(/^sha256:[a-f0-9]{64}$/),replacements:z.array(z.strictObject({questionId:id,paragraphId:id.nullable(),expectedText:z.string().max(80000),replacementText:z.string().min(1).max(80000),findingIds:z.array(id).min(1).max(100)})).min(1).max(50)});
export function applyRewrite(input:EvaluationInput,result:EvaluationResult,value:unknown):EvaluationInput {
  const parsed=rewriteSchema.safeParse(value);if(!parsed.success)return fail('INVALID_REWRITE');
  const request=parsed.data, identity=result.identity;
  if(input.mode!=='IMPROVE'||result.status!=='REVISE'||identity.draftVersion>=3)fail('REWRITE_NOT_ALLOWED');
  if(request.sessionId!==identity.sessionId||request.basedOnEvaluationId!==identity.evaluationId||request.expectedDraftVersion!==identity.draftVersion||request.expectedDraftHash!==identity.draftHash||identify(input,identity.sessionId,identity.draftVersion).draftHash!==identity.draftHash)fail('STALE_DRAFT');
  const next=structuredClone(input);
  for(const a of next.answers) {
    const edits=request.replacements.filter(e=>e.questionId===a.questionId);
    if(!edits.length)continue;
    if(!input.editScope.questionIds.includes(a.questionId))fail('OUTSIDE_EDIT_SCOPE');
    const locations=new Set(edits.map(e=>e.paragraphId));
    if(locations.size!==edits.length || locations.has(null)&&edits.length>1)fail('OVERLAPPING_REPLACEMENTS');
    for(const edit of edits) {
      if(!edit.findingIds.every(id=>result.rewriteTargets.some(t=>t.findingIds.includes(id)&&t.target.questionId===a.questionId&&(t.target.paragraphId===edit.paragraphId||t.target.paragraphId===null&&edit.paragraphId===null))))fail('UNSUPPORTED_REWRITE');
      if(edit.paragraphId!==null&&input.editScope.paragraphIds.length&&!input.editScope.paragraphIds.includes(edit.paragraphId))fail('OUTSIDE_EDIT_SCOPE');
    }
    const whole=edits.find(e=>e.paragraphId===null);
    if(whole) {
      if(input.editScope.paragraphIds.length||whole.expectedText!==a.text)fail('STALE_DRAFT');
      if(!input.editScope.allowRestructure)fail('RESTRUCTURE_NOT_ALLOWED');
      a.text=whole.replacementText;
      // A whole-question rewrite must be explicitly allowed; new indices never invent evidence links.
      const segments=Array.from(a.text);a.paragraphs=[{id:`replacement-${identity.draftVersion+1}-${a.questionId}`,start:0,end:segments.length,role:'재구성 후보',factIds:[],requirementIds:[]}];
    } else {
      if(edits.some(e=>!a.paragraphs.some(p=>p.id===e.paragraphId)))fail('UNKNOWN_PARAGRAPH');
      let offset=0;const original=a.text;
      for(const p of a.paragraphs) {
        const edit=edits.find(e=>e.paragraphId===p.id),start=p.start,end=p.end;
        if(edit) {
          if(slice(original,start,end)!==edit.expectedText)fail('STALE_DRAFT');
          const breaks=(s:string)=>s.match(/(?:\r\n|\r|\n)[\t ]*(?:\r\n|\r|\n)/g)?.length??0;
          if(breaks(edit.replacementText)!==breaks(edit.expectedText))fail('RESTRUCTURE_NOT_ALLOWED');
          const before=slice(a.text,0,start+offset),after=slice(a.text,end+offset,Array.from(a.text).length);
          a.text=before+edit.replacementText+after;
          p.start=start+offset;p.end=p.start+Array.from(edit.replacementText).length;
          offset+=Array.from(edit.replacementText).length-(end-start);
        } else {p.start+=offset;p.end+=offset;}
      }
    }
  }
  if(request.replacements.some(e=>!input.answers.some(a=>a.questionId===e.questionId)))fail('UNKNOWN_QUESTION');
  for(const original of input.answers) {
    const updated=next.answers.find(a=>a.questionId===original.questionId)!;
    for(const exact of input.editScope.preserveExact) {
      const count=(s:string)=>s.split(exact).length-1;
      if(count(original.text)!==count(updated.text))fail('PRESERVED_TEXT_CHANGED');
    }
    for(const forbidden of input.editScope.forbiddenClaims)if(updated.text.includes(forbidden)&&!original.text.includes(forbidden))fail('FORBIDDEN_CLAIM_ADDED');
  }
  if(identify(next,identity.sessionId,identity.draftVersion+1).draftHash===identity.draftHash)fail('UNCHANGED_DRAFT');
  return parseInput(next);
}
export function compareCandidate(previous:EvaluationResult,candidate:EvaluationResult) {
  const result=structuredClone(candidate);
  const reject=(reason:string)=>{if(!['ERROR','INCOMPLETE','NEEDS_INPUT'].includes(result.status))result.status='REVIEW';result.stopReason=reason;result.rewriteTargets=[];return {accepted:false,result};};
  if(['ERROR','INCOMPLETE','NEEDS_INPUT','REVIEW'].includes(result.status))return {accepted:false,result};
  const versionChanged=(Object.keys(VERSIONS) as (keyof typeof VERSIONS)[]).some(key=>previous.identity[key]!==result.identity[key]);
  if(versionChanged||previous.identity.contextHash!==result.identity.contextHash||JSON.stringify(previous.identity.resolvedModels)!==JSON.stringify(result.identity.resolvedModels)||result.identity.resolvedModels.length!==1)return reject('COMPARISON_CONTEXT_CHANGED');
  const key=(row:{target:unknown},id:string)=>JSON.stringify([row.target,id]);
  const oldGates=new Map(previous.gates.filter(g=>!g.target.paragraphId).map(g=>[key(g,g.gateId),g]));
  if(result.gates.filter(g=>!g.target.paragraphId).some(g=>g.status==='FAIL'&&oldGates.get(key(g,g.gateId))?.status!=='FAIL'))return reject('NEW_GATE_FAILURE');
  const oldMetrics=new Map(previous.metrics.filter(m=>!m.target.paragraphId).map(m=>[key(m,m.metricId),m]));
  if(result.metrics.filter(m=>!m.target.paragraphId).some(m=>m.score!==null&&oldMetrics.get(key(m,m.metricId))?.score!=null&&oldMetrics.get(key(m,m.metricId))!.score!-m.score>=0.3-1e-9))return reject('METRIC_REGRESSION');
  const fixed=result.gates.some(g=>!g.target.paragraphId&&g.status==='PASS'&&oldGates.get(key(g,g.gateId))?.status==='FAIL');
  const gains=result.questionScores.map(q=>{const old=previous.questionScores.find(p=>p.questionId===q.questionId);return q.score100===null||old?.score100==null?null:q.score100-old.score100;});
  if(!fixed&&(!gains.length||gains.some(g=>g===null)||Math.max(...gains as number[])<2))return reject('NO_MEANINGFUL_IMPROVEMENT');
  return {accepted:true,result};
}
