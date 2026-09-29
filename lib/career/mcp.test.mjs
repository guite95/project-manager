import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {fixture} from './fixtures.mjs';
const api=await import('./mcp.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('MCP 도구는 원격 호출 동의와 scope 없이 평가/저장을 실행하지 않는다',async t=>{
  assert.equal(typeof api.createCareerMcp,'function');let calls=0;
  const services={checkOwner:async()=>{},start:async()=>{calls++;return {status:'PASS'};}};
  const server=api.createCareerMcp({ownerId:'owner',scopes:['career:read']},services);
  const [a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'test',version:'1'});
  await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const tools=await client.listTools();assert.equal(tools.tools.length,8);
  const save=tools.tools.find(t=>t.name==='career_save_draft');assert.equal(save.annotations.destructiveHint,true);
  const result=await client.callTool({name:'career_evaluate',arguments:{input:fixture(),requestId:'test-request-12345',consentToExternalEvaluation:true}});
  assert.equal(result.isError,true);assert.equal(calls,0);assert.match(result._meta?.['mcp/www_authenticate']?.[0]??'',/career:evaluate/);
  const audit=await client.callTool({name:'career_audit',arguments:{text:'가😀',newlines:'PRESERVE'}});
  assert.equal(audit.structuredContent.CODEPOINTS,2);
});
test('동의 없는 외부 평가를 거부하고 계약은 실제 입력 스키마를 제공한다',async t=>{
  assert.equal(typeof api.createCareerMcp,'function');let calls=0;
  const server=api.createCareerMcp({ownerId:'owner',scopes:['career:read','career:evaluate']},{checkOwner:async()=>{},start:async()=>{calls++;return {};}});
  const [a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'test',version:'1'});await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const result=await client.callTool({name:'career_evaluate',arguments:{input:fixture(),requestId:'test-request-12345',consentToExternalEvaluation:false}});assert.equal(result.isError,true);assert.equal(calls,0);
  const contract=await client.callTool({name:'career_contract',arguments:{}});assert.equal(contract.structuredContent.inputSchema.properties.contractVersion.const,'career-contract/0.1.0');
});
