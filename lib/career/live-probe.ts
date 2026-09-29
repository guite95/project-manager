import {CareerError,fail} from './core.ts';
import {parseDecisions,readDecisionReceipt,requestBytes,MAX_REQUEST_BYTES,type DecisionProvider,type DecisionResponse} from './jev.ts';

/** Synthetic-only CLI guard. Reported-cost ceiling, not a provider-side hard cap. */
export function createMeteredProvider(upstream:DecisionProvider,limits:{maxCalls:number;maxCost:number}) {
  if(!Number.isInteger(limits.maxCalls)||limits.maxCalls<1||limits.maxCalls>60||!Number.isFinite(limits.maxCost)||limits.maxCost<=0||limits.maxCost>.1)fail('INVALID_PROBE_LIMIT');
  let calls=0,reportedCost=0,unknownCostCalls=0,stopped=false,busy=false;
  const receipts:(Pick<DecisionResponse,'id'|'model'|'usage'>&{validation:'PASS'|'ERROR'})[]=[];
  const provider:DecisionProvider=async request=>{
    if(stopped)fail('PROBE_STOPPED');
    if(busy)fail('PROBE_CONCURRENT_CALL');
    if(requestBytes(request)>MAX_REQUEST_BYTES)fail('PROVIDER_INPUT_LIMIT');
    if(calls>=limits.maxCalls)fail('PROBE_CALL_LIMIT');
    // Reserve $0.002 before each call. Stop after any uncertain billing event.
    if(reportedCost+.002>limits.maxCost)fail('PROBE_COST_LIMIT');
    busy=true;calls++;let accounted=false;
    try {
      const raw=await upstream(request),receipt=readDecisionReceipt(raw);
      if(!receipt)fail('PROBE_UNKNOWN_COST');
      accounted=true;reportedCost+=receipt.usage.cost;
      const entry={...receipt,validation:'ERROR' as 'PASS'|'ERROR'};receipts.push(entry);
      parseDecisions(raw,request.questions);entry.validation='PASS';
      if(reportedCost>=limits.maxCost)stopped=true;
      return raw;
    }catch(error){
      if(!accounted)unknownCostCalls++;
      stopped=true;
      throw error instanceof CareerError?error:new CareerError('PROBE_CALL_FAILED');
    }finally{busy=false;}
  };
  return {provider,snapshot:()=>({calls,reportedCost,unknownCostCalls,costComplete:unknownCostCalls===0,stopped,receipts:structuredClone(receipts)})};
}
