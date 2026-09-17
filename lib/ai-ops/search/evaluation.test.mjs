import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDataset,scoreExample,compareEvaluation,summarizeEvaluation} from './evaluation.mjs';
test('evaluation freezes filters and distinguishes no-answer correctness from positive recall',()=>{
 const item={id:'q',query:'nginx',split:'holdout',filters:{to:'2026-09-16'},relevant:{s:3}};
 assert.equal(validateDataset([item]).length,1);
 const good=scoreExample(item,{messages:[{id:'m',sessionId:'s',body:'nginx'}]});
 const bad=scoreExample(item,{messages:[]});
 assert.equal(good.contextRecall10,1);assert.equal(bad.contextRecall10,0);
 assert.equal(compareEvaluation([good],[bad]).passed,false);
 assert.equal(summarizeEvaluation([good]).holdout.contextRecall10,1);
 assert.equal(scoreExample({id:'n',query:'unrelated',relevant:{},noAnswer:true},{messages:[]}).metrics.noAnswerCorrect,true);
 assert.throws(()=>validateDataset([{...item,filters:{mode:'literal'}}]));
 assert.throws(()=>scoreExample(item,{fallbackReason:'EMBEDDING_UNAVAILABLE',messages:[]}));
});
