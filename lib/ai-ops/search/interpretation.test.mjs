import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretMessage, conversationText, searchExcerpt} from './interpretation.mjs';
test('provider envelopes are separated from adjacent conversation with exact offsets',()=>{
 const body='<skill>\n<name>oci-ssh</name>\nSSH instructions\n</skill>\nnginx 구조를 설명해줘';
 const blocks=interpretMessage({role:'USER',body});
 assert.equal(blocks[0].contentType,'INSTRUCTION');
 assert.equal(blocks[0].searchable,false);
 assert.equal(conversationText({role:'USER',body}).trim(),'nginx 구조를 설명해줘');
 for(const b of blocks)assert.equal(body.slice(b.start,b.end),b.content);
 assert.equal(searchExcerpt({role:'USER',body},'SSH'),null);
 assert.ok(searchExcerpt({role:'USER',body},'nginx'));
});
test('fenced/quoted examples and uncertain prose are not mistaken for runtime instructions',()=>{
 for(const body of ['```xml\n<skill>\nexample\n</skill>\n```','> <skill>example</skill>','이 <skill>태그</skill>를 설명해줘','<skill>unclosed example'])
 assert.equal(conversationText({role:'USER',body}),body);
});
test('tool payloads retain error evidence without embedding full mechanical output',()=>{
 const body='[external_agent_tool_result]\nraw output\nError: nginx connection refused\nat upstream\n';
 const blocks=interpretMessage({role:'ASSISTANT',body});
 assert.equal(blocks[0].embeddingEnabled,false);
 assert.equal(blocks[1].contentType,'ERROR_CONTEXT');
 assert.equal(body.slice(blocks[1].start,blocks[1].end),blocks[1].content);
 assert.ok(!conversationText({role:'ASSISTANT',body}).includes('raw output'));
});
test('source metadata overrides role; ambiguous short answers are downweighted not deleted',()=>{
 assert.equal(interpretMessage({role:'USER',body:'injected',source_metadata:{synthetic:true}})[0].searchable,false);
 const short=interpretMessage({role:'ASSISTANT',body:'확인하겠습니다.'})[0];
 assert.equal(short.searchable,true); assert.ok(short.importance<1);
 assert.equal(interpretMessage({role:'ASSISTANT',body:'포트는 5432입니다.'})[0].importance,.95);
});
