import {readFileSync} from 'node:fs';
import {parseEnv,parseArgs} from 'node:util';
import {createJevProvider} from '../lib/career/jev.ts';
import {createMeteredProvider} from '../lib/career/live-probe.ts';
import {probeCases} from '../lib/career/probe-cases.mjs';
import {evaluate} from '../lib/career/evaluator.ts';
import {CareerError,hash,VERSIONS,parseInput} from '../lib/career/core.ts';

// No DB imports, arbitrary input files, retries, or raw upstream/key logging.
async function main(){
  const {values}=parseArgs({options:{live:{type:'boolean',default:false},suite:{type:'string',default:'calibration'},case:{type:'string'},'max-calls':{type:'string',default:'30'},'max-cost':{type:'string',default:'0.05'}}});
  const available=probeCases(values.suite),selected=values.case?.split(',');
  if(selected?.some(id=>!available.some(c=>c.id===id)))throw new CareerError('INVALID_PROBE_CASE');
  const cases=available.filter(c=>!selected||selected.includes(c.id));cases.forEach(c=>parseInput(c.input));
  const limits={maxCalls:Number(values['max-calls']),maxCost:Number(values['max-cost'])};
  const plan={suite:values.suite,fixtureHash:hash(cases),versions:VERSIONS,cases:cases.map(c=>({id:c.id,expected:c.expected})),limits};
  if(!values.live){createMeteredProvider(async()=>{},limits);console.log(JSON.stringify({mode:'DRY_RUN',...plan},null,2));return;}
  let key=process.env.OPENROUTER_API_KEY;
  if(!key){try{key=parseEnv(readFileSync('.env.local','utf8')).OPENROUTER_API_KEY;}catch{throw new CareerError('OPENROUTER_NOT_CONFIGURED');}}
  const meter=createMeteredProvider(createJevProvider(key?.trim()??''),limits);
  console.log(JSON.stringify({type:'plan',...plan}));
  const outcomes=[];
  try{
    for(const c of cases){
      const result=await evaluate(c.input,{sessionId:'synthetic-live-probe',draftVersion:1,provider:meter.provider});
      const checks=c.expected.map(expected=>{
        const actual=expected.kind==='gate'?result.gates.find(g=>g.gateId===expected.id&&!g.target.paragraphId):result.requirementMatches.find(m=>m.requirementId===expected.id);
        const status=result.status==='ERROR'||result.status==='INCOMPLETE'?'ERROR':!actual?'FAIL':actual.status==='UNKNOWN'&&expected.status!=='UNKNOWN'?'ABSTAIN':actual.confidence!==null&&actual.confidence<.7?'ABSTAIN':actual.status===expected.status?'PASS':'FAIL';
        return {kind:expected.kind,id:expected.id,expected:expected.status,actual:actual?.status,confidence:actual?.confidence,status};
      });
      outcomes.push(...checks);
      console.log(JSON.stringify({type:'case',id:c.id,status:result.status,stopReason:result.stopReason,checks,scores:result.questionScores,metrics:result.metrics.filter(m=>!m.target.paragraphId),gates:result.gates,requests:result.requests}));
      if(result.status==='ERROR'||result.status==='INCOMPLETE'||meter.snapshot().stopped)break;
    }
  }finally{
    const counts=Object.fromEntries(['PASS','FAIL','ABSTAIN','ERROR'].map(s=>[s,outcomes.filter(o=>o.status===s).length]));
    const expectedChecks=cases.reduce((n,c)=>n+c.expected.length,0),missingChecks=expectedChecks-outcomes.length;
    console.log(JSON.stringify({type:'summary',suite:values.suite,counts,missingChecks,...meter.snapshot()}));
    if(counts.FAIL||counts.ERROR||missingChecks)process.exitCode=1;
  }
}
main().catch(error=>{console.error(JSON.stringify({error:error instanceof CareerError?error.code:'PROBE_CONFIGURATION_ERROR'}));process.exitCode=1;});
