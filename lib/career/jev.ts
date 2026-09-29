import {CareerError, MODEL, fail} from './core.ts';
export type DecisionQuestion={type:'score';instructions:string;criteria:string[]}|{type:'choice';instructions:string;criteria:Record<string,string>};
export type DecisionRequest={state:unknown;questions:Record<string,DecisionQuestion>};
export type DecisionProvider=(request:DecisionRequest)=>Promise<unknown>;
// Conservative UTF-8 byte ceiling, not a claim to implement the provider tokenizer.
export const MAX_REQUEST_BYTES=28000;
export const requestBytes=(request:DecisionRequest)=>Buffer.byteLength(JSON.stringify({model:MODEL,...request}));
export function createJevProvider(key:string,fetcher:typeof fetch=fetch):DecisionProvider {
  if(!key || /[\r\n]/.test(key)) fail('OPENROUTER_NOT_CONFIGURED');
  return async request=>{
    if(requestBytes(request)>MAX_REQUEST_BYTES) fail('PROVIDER_INPUT_LIMIT');
    try {
      const response=await fetcher('https://openrouter.ai/api/alpha/decisions',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
        headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:MODEL,...request}),
      });
      if(!response.ok) { await response.body?.cancel(); return fail(`PROVIDER_HTTP_${response.status}`); }
      const reader=response.body?.getReader(); if(!reader) return fail('PROVIDER_EMPTY_RESPONSE');
      const chunks:Uint8Array[]=[];let size=0;
      try { while(true) {const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000) fail('PROVIDER_RESPONSE_LIMIT');chunks.push(value);} }
      finally {await reader.cancel();}
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch(error) {
      if(error instanceof CareerError) throw error;
      return fail('PROVIDER_UNAVAILABLE');
    }
  };
}
export type Decision={type:'score'|'choice';score:number|null;choice:string|null;confidence:number|null;probabilities:Record<string,number>};
export type DecisionResponse={id:string;model:string;answers:Record<string,Decision>;usage:{input_tokens:number;output_tokens:number;cost:number}};
const record=(x:unknown):x is Record<string,unknown>=>Boolean(x&&typeof x==='object'&&!Array.isArray(x));
const unit=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
export function parseDecisions(value:unknown,questions:Record<string,DecisionQuestion>):DecisionResponse {
  if(!record(value)||typeof value.id!=='string'||!value.id||typeof value.model!=='string'||!/^typesafe\/jev-1\.13(?:-\d{8})?$/.test(value.model)||!record(value.answers)||!record(value.usage)) return fail('INVALID_PROVIDER_RESPONSE');
  const raw=value.answers;
  if(Object.keys(raw).length!==Object.keys(questions).length || Object.keys(raw).some(k=>!Object.hasOwn(questions,k))) fail('INVALID_PROVIDER_COVERAGE');
  const answers:Record<string,Decision>={};
  for(const [id,q] of Object.entries(questions)) {
    const a=raw[id];if(!record(a)||a.type!==q.type||!record(a.probabilities)) return fail('INVALID_PROVIDER_RESPONSE');
    const keys=q.type==='score'?q.criteria.map((_,i)=>String(i)):Object.keys(q.criteria);
    const probabilities=a.probabilities;
    if(Object.keys(probabilities).length!==keys.length||keys.some(k=>!unit(probabilities[k]))||Math.abs(Object.values(probabilities).reduce<number>((sum,n)=>sum+Number(n),0)-1)>0.001) fail('INVALID_PROVIDER_PROBABILITIES');
    if(a.confidence!==undefined && !unit(a.confidence)) fail('INVALID_PROVIDER_CONFIDENCE');
    const p=probabilities as Record<string,number>;
    if(q.type==='score' && (typeof a.score!=='number'||!Number.isFinite(a.score)||a.score<0||a.score>4||Math.abs(keys.reduce((n,k)=>n+Number(k)*p[k],0)-a.score)>0.01)) fail('INVALID_PROVIDER_SCORE');
    if(q.type==='choice' && (typeof a.choice!=='string'||!keys.includes(a.choice)||p[a.choice]+0.001<Math.max(...Object.values(p)))) fail('INVALID_PROVIDER_CHOICE');
    answers[id]={type:q.type,score:q.type==='score'?a.score as number:null,choice:q.type==='choice'?a.choice as string:null,confidence:a.confidence===undefined?null:a.confidence as number,probabilities:p};
  }
  const usage=value.usage;
  if(![usage.input_tokens,usage.output_tokens].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)||typeof usage.cost!=='number'||!Number.isFinite(usage.cost)||usage.cost<0) fail('INVALID_PROVIDER_USAGE');
  return {id:value.id,model:value.model,answers,usage:usage as DecisionResponse['usage']};
}
