import { evaluateRanking } from './ranking.mjs';
export function validateDataset(dataset) {
  if (!Array.isArray(dataset) || !dataset.length || dataset.length > 1000) throw new Error('Invalid evaluation dataset');
  for (const item of dataset) {
    if (typeof item.query !== 'string' || !item.query.trim() || item.query.length > 200 ||
        !item.relevant || typeof item.relevant !== 'object' || Array.isArray(item.relevant) ||
        Object.values(item.relevant).some(v => !Number.isInteger(v) || v < 0 || v > 3) ||
        (item.noAnswer ? Object.values(item.relevant).some(v=>v>0) : !Object.values(item.relevant).some(v=>v>0)) ||
        (item.filters && (typeof item.filters !== 'object' || Array.isArray(item.filters) || Object.keys(item.filters).some(k => !['from','to','source','device','model'].includes(k)))))
      throw new Error('Invalid evaluation labels or filters');
  }
  return dataset;
}
export function scoreExample(example, result) {
  if (result.fallbackReason) throw new Error('Evaluation requires vector search without fallback');
  const messages=result.messages, positives=Object.keys(example.relevant).filter(k=>example.relevant[k]>0);
  const top10=messages.slice(0,10);
  const noise=top10.filter(m=>/^\s*(?:<skill>|\[external_agent_tool_result\]|\[Request interrupted by user(?: for tool use)?\]\s*$)/i.test(m.snippet??m.body??'')).length;
  return {
    id:example.id??example.query,query:example.query,split:example.split??'development',filters:example.filters??{},relevant:example.relevant,noAnswer:!!example.noAnswer,
    metrics: example.noAnswer ? {noAnswerCorrect:messages.length===0} : evaluateRanking(messages.map(m=>m.sessionId),example.relevant),
    contextRecall10: positives.length ? new Set(top10.filter(m=>positives.includes(m.sessionId)).map(m=>m.sessionId)).size/positives.length : null,
    firstRelevantMessageRank: positives.length ? (()=>{const i=messages.findIndex(m=>positives.includes(m.sessionId));return i<0?null:i+1;})() : null,
    noiseAt10:top10.length?noise/top10.length:0,resultCount:messages.length,
    top10:top10.map(m=>({id:m.id,sessionId:m.sessionId,contentType:m.contentType,evidence:m.evidence})),
  };
}
export function summarizeEvaluation(rows) {
  const mean=(xs,key)=>xs.length?xs.reduce((s,x)=>s+x[key],0)/xs.length:null;
  return Object.fromEntries(['development','holdout'].map(split=>{
    const selected=rows.filter(r=>r.split===split), positives=selected.filter(r=>r.contextRecall10!==null), negatives=selected.filter(r=>'noAnswerCorrect' in r.metrics);
    return [split,{queries:selected.length,contextRecall10:mean(positives,'contextRecall10'),noiseAt10:mean(selected,'noiseAt10'),
      mrr:positives.length?positives.reduce((s,r)=>s+r.metrics.mrr,0)/positives.length:null,
      ndcg10:positives.length?positives.reduce((s,r)=>s+r.metrics.ndcg10,0)/positives.length:null,
      noAnswerAccuracy:negatives.length?negatives.filter(r=>r.metrics.noAnswerCorrect).length/negatives.length:null}];
  }));
}
export function compareEvaluation(baseline, current) {
  const old=new Map(baseline.map(r=>[r.id,r]));
  const regressions=[];
  for(const row of current){
    const before=old.get(row.id);
    if(!before)throw new Error('Baseline is missing a query');
    if(before.query!==row.query || JSON.stringify(before.filters??{})!==JSON.stringify(row.filters??{}) || JSON.stringify(before.relevant??{})!==JSON.stringify(row.relevant??{}))throw new Error('Baseline query, scope or labels differ');
    const oldRecall=before.contextRecall10 ?? (before.noAnswer ? null : new Set(before.top10.filter(m=>before.relevant?.[m.sessionId]>0).map(m=>m.sessionId)).size/Math.max(1,Object.values(before.relevant??{}).filter(v=>v>0).length));
    if((oldRecall!==null && row.contextRecall10<oldRecall) ||
       (before.metrics.noAnswerCorrect===true && row.metrics.noAnswerCorrect===false)) regressions.push(row.id);
  }
  return {passed:regressions.length===0,regressions};
}
