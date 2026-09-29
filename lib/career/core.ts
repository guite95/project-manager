import {createHash, randomUUID} from 'node:crypto';
import {z} from 'zod';

export class CareerError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code=code; }
}
export function fail(code: string): never { throw new CareerError(code); }
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const text=z.string().max(80000);
const ids=z.array(id).max(100);
const integer=z.number().int().min(0).max(1000000);
const quote=z.strictObject({sourceId:id,start:integer,end:integer,quote:text});
export type Logic={op:'REF';requirementId:string}|{op:'ALL'|'ANY';children:Logic[]};
const logic: z.ZodType<Logic> = z.lazy(()=>z.union([
  z.strictObject({op:z.literal('REF'),requirementId:id}),
  z.strictObject({op:z.enum(['ALL','ANY']),children:z.array(logic).min(1).max(50)}),
]));
export const lengthRuleSchema=z.strictObject({metric:z.enum(['CODEPOINTS','NO_ASCII_SPACES','NO_WHITESPACE','UTF8_BYTES','UTF16_UNITS']),newlines:z.enum(['PRESERVE','LF','REMOVE']),minimum:integer.nullable(),maximum:integer.nullable(),target:integer.nullable(),origin:z.enum(['OFFICIAL','USER_SPECIFIED','ASSUMED'])});
export const inputSchema=z.strictObject({
  contractVersion:z.literal('career-contract/0.1.0'),sessionId:id.nullable(),mode:z.enum(['DIAGNOSE','IMPROVE']),
  sources:z.array(z.strictObject({id,origin:z.enum(['USER_PROVIDED','RECRUITMENT_DOCUMENT','PROJECT_RECORD','JD_COPY','STYLE_REFERENCE']),title:z.string().max(200),text,documentId:id.nullable(),revision:integer.nullable(),url:z.string().url().max(2000).nullable(),verification:z.enum(['USER_STATEMENT','SOURCE_READ'])})).max(50),
  jd:z.strictObject({sourceIds:ids,completeness:z.enum(['COMPLETE','PARTIAL','ABSENT']),requirements:z.array(z.strictObject({id,kind:z.enum(['ELIGIBILITY','DUTY','COMPETENCY']),priority:z.enum(['REQUIRED','PREFERRED','UNSPECIFIED']),text,sourceRef:quote})).max(50),eligibilityLogic:logic.nullable()}),
  facts:z.array(z.strictObject({id,statement:text,sourceRefs:z.array(quote).min(1).max(20),actor:z.enum(['SELF','TEAM','OTHER','UNKNOWN']),stage:z.enum(['COMPLETED','IN_PROGRESS','LEARNING','PLANNED','NOT_APPLICABLE','UNKNOWN']),confirmation:z.enum(['USER_STATED','SOURCE_SUPPORTED','UNCONFIRMED']),supersedes:ids})).max(100),
  questions:z.array(z.strictObject({id,prompt:z.string().min(1).max(8000),requiredElements:z.array(z.strictObject({id,text,quote:text})).max(20),relevantRequirementIds:ids,lengthRule:lengthRuleSchema.nullable(),formatInstructions:z.array(z.string().max(2000)).max(20)})).min(1).max(10),
  answers:z.array(z.strictObject({questionId:id,text,paragraphs:z.array(z.strictObject({id,start:integer,end:integer,role:z.string().max(1000),factIds:ids,requirementIds:ids})).min(1).max(50)})).min(1).max(10),
  styleReferenceSourceIds:ids,
  editScope:z.strictObject({questionIds:ids.min(1),paragraphIds:ids,allowRestructure:z.boolean(),preserveExact:z.array(z.string().min(1).max(8000)).max(30),forbiddenClaims:z.array(z.string().min(1).max(8000)).max(30)}),
  baseDocument:z.strictObject({id,expectedRevision:integer}).nullable(),
});
export type EvaluationInput=z.infer<typeof inputSchema>;
export type DraftAnswer=EvaluationInput['answers'][number];
export type Target={questionId:string|null;paragraphId:string|null;start:number|null;end:number|null};
export const target=(questionId:string|null=null,paragraphId:string|null=null,start:number|null=null,end:number|null=null):Target=>({questionId,paragraphId,start,end});
export const slice=(s:string,start:number,end:number)=>Array.from(s).slice(start,end).join('');
export function parseInput(value:unknown):EvaluationInput {
  let serialized:string;
  try { serialized=JSON.stringify(value); } catch { return fail('INVALID_INPUT'); }
  if(!serialized || Buffer.byteLength(serialized)>300000) fail('INPUT_TOO_LARGE');
  // Bound recursive logic before Zod recursion, including malicious deeply nested JSON.
  let depth=0,quoted=false,escaped=false;
  for(const c of serialized) {
    if(quoted) { if(escaped) escaped=false; else if(c==='\\') escaped=true; else if(c==='"') quoted=false; }
    else if(c==='"') quoted=true;
    else if(c==='{'||c==='[') { if(++depth>25) fail('INPUT_TOO_DEEP'); }
    else if(c==='}'||c===']') depth--;
  }
  const result=inputSchema.safeParse(value); if(!result.success) return fail('INVALID_INPUT');
  const x=result.data, all=new Set<string>();
  for(const row of [...x.sources,...x.facts,...x.jd.requirements,...x.questions,...x.questions.flatMap(q=>q.requiredElements),...x.answers.flatMap(a=>a.paragraphs)]) {
    if(all.has(row.id)) fail('DUPLICATE_ID'); all.add(row.id);
  }
  const sources=new Map(x.sources.map(s=>[s.id,s])), facts=new Map(x.facts.map(f=>[f.id,f])), requirements=new Map(x.jd.requirements.map(r=>[r.id,r]));
  const has=(values:string[],available:Map<string,unknown>|Set<string>)=>{
    if(new Set(values).size!==values.length || values.some(v=>!available.has(v))) fail('INVALID_REFERENCE');
  };
  const verifyQuote=(ref:z.infer<typeof quote>)=>{
    const s=sources.get(ref.sourceId);
    if(!s || ref.end<=ref.start || ref.end>Array.from(s.text).length || slice(s.text,ref.start,ref.end)!==ref.quote) fail('INVALID_QUOTE');
  };
  has(x.jd.sourceIds,sources); has(x.styleReferenceSourceIds,sources);
  if(x.styleReferenceSourceIds.some(s=>sources.get(s)?.origin!=='STYLE_REFERENCE')) fail('INVALID_STYLE_SOURCE');
  if(x.jd.completeness==='ABSENT' && (x.jd.sourceIds.length || x.jd.requirements.length || x.jd.eligibilityLogic)) fail('JD_ABSENT_CONFLICT');
  if(x.jd.completeness==='COMPLETE' && !x.jd.sourceIds.length) fail('JD_SOURCE_REQUIRED');
  for(const r of x.jd.requirements) { verifyQuote(r.sourceRef); if(!x.jd.sourceIds.includes(r.sourceRef.sourceId)) fail('INVALID_JD_SOURCE'); }
  const walk=(node:Logic)=>{if(node.op==='REF') {if(requirements.get(node.requirementId)?.kind!=='ELIGIBILITY') fail('INVALID_ELIGIBILITY');} else node.children.forEach(walk);};
  if(x.jd.eligibilityLogic) walk(x.jd.eligibilityLogic);
  const discarded=new Set(x.facts.flatMap(f=>f.supersedes));
  const visited=new Set<string>(),visiting=new Set<string>();
  const visit=(key:string)=>{
    if(visiting.has(key))fail('FACT_CYCLE');if(visited.has(key))return;
    visiting.add(key);for(const child of facts.get(key)!.supersedes) {if(!facts.has(child))fail('INVALID_REFERENCE');visit(child);}
    visiting.delete(key);visited.add(key);
  };
  for(const f of x.facts) {
    has(f.supersedes,facts); f.sourceRefs.forEach(verifyQuote);
    if(f.sourceRefs.some(r=>sources.get(r.sourceId)?.origin==='STYLE_REFERENCE')) fail('STYLE_IS_NOT_EVIDENCE');
    visit(f.id);
  }
  const questionIds=new Set(x.questions.map(q=>q.id)); has(x.editScope.questionIds,questionIds);
  has(x.answers.map(a=>a.questionId),questionIds);
  if(x.answers.length!==x.questions.length) fail('MISSING_ANSWER');
  for(const q of x.questions) {
    has(q.relevantRequirementIds,requirements);
    if(q.requiredElements.some(e=>!e.quote || !q.prompt.includes(e.quote))) fail('INVALID_QUESTION_QUOTE');
    const r=q.lengthRule;
    if(r && r.minimum!==null && r.maximum!==null && r.minimum>r.maximum) fail('INVALID_LENGTH_RULE');
  }
  for(const a of x.answers) {
    let end=0; const size=Array.from(a.text).length;
    for(const p of a.paragraphs) {
      if(p.start<end || p.end<=p.start || p.end>size || slice(a.text,end,p.start).trim()) fail('INVALID_PARAGRAPHS');
      end=p.end; has(p.factIds,facts);has(p.requirementIds,requirements);
      if(p.factIds.some(f=>discarded.has(f)||facts.get(f)?.confirmation==='UNCONFIRMED')) fail('UNCONFIRMED_FACT');
    }
    if(slice(a.text,end,size).trim()) fail('INVALID_PARAGRAPHS');
  }
  has(x.editScope.paragraphIds,new Set(x.answers.filter(a=>x.editScope.questionIds.includes(a.questionId)).flatMap(a=>a.paragraphs.map(p=>p.id))));
  if(x.editScope.allowRestructure && x.editScope.paragraphIds.length) fail('RESTRUCTURE_REQUIRES_WHOLE_QUESTION');
  return x;
}

export function auditText(text:string,newlines:'PRESERVE'|'LF'|'REMOVE'='PRESERVE') {
  const s=newlines==='PRESERVE'?text:text.replace(/\r\n|\r|\n/g,newlines==='LF'?'\n':'');
  // Python str.isspace: excludes FEFF, includes U+001C..001F and U+0085.
  const whitespace=/[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/gu;
  return {CODEPOINTS:Array.from(s).length,NO_ASCII_SPACES:Array.from(s.replace(/ /g,'')).length,NO_WHITESPACE:Array.from(s.replace(whitespace,'')).length,UTF8_BYTES:Buffer.byteLength(s),UTF16_UNITS:s.length};
}
export function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value!==null && typeof value==='object') return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hash=(value:unknown)=>`sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
export const MODEL='typesafe/jev-1.13';
export const VERSIONS={rubricVersion:'career-quality/0.1.0',policyVersion:'career-policy/0.1.0',promptVersion:'career-prompt/0.1.0',segmentationVersion:'career-segments/0.1.0'};
export function identify(x:EvaluationInput,sessionId:string,draftVersion:number) {
  const draftHash=hash(x.answers.map(({questionId,text})=>({questionId,text})).sort((a,b)=>a.questionId<b.questionId?-1:1));
  const {sources,jd,facts,questions,styleReferenceSourceIds,editScope,mode}=x;
  const contextHash=hash({sources,jd,facts,questions,styleReferenceSourceIds,editScope,mode});
  return {evaluationId:randomUUID(),sessionId,draftVersion,draftHash,contextHash,...VERSIONS,requestedModel:MODEL,resolvedModels:[] as string[],evaluationKey:hash({draftHash,contextHash,...VERSIONS,contractVersion:x.contractVersion,model:MODEL,paragraphs:x.answers.map(a=>({questionId:a.questionId,paragraphs:a.paragraphs}))})};
}
export type Match='MET'|'PARTIAL'|'NOT_MET'|'UNKNOWN';
export function matchLogic(node:Logic|null,matches:Record<string,Match>):Match {
  if(!node) return 'UNKNOWN'; if(node.op==='REF') return Object.hasOwn(matches,node.requirementId)?matches[node.requirementId]:'UNKNOWN';
  const values=node.children.map(c=>matchLogic(c,matches));
  if(node.op==='ALL') { if(values.includes('NOT_MET')) return 'NOT_MET';if(values.every(v=>v==='MET')) return 'MET'; }
  else {if(values.includes('MET')) return 'MET';if(values.every(v=>v==='NOT_MET')) return 'NOT_MET';}
  return values.includes('UNKNOWN')?'UNKNOWN':'PARTIAL';
}
