import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {fixture} from './fixtures.mjs';
import {CareerError} from './core.ts';
import {RecruitmentError} from '../recruitment.ts';
import {emptyApplication} from '../recruitment-applications.ts';
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

const application=()=>({...emptyApplication(),company:'Test company',role:'Developer'});
const draft=()=>({kind:'COVER_LETTER',scope:'PERSONAL',title:'Draft',project:'Test company',summary:'',tags:[],sections:[{title:'Question',body:'Draft text'}],sourceUrls:[]});
const task=()=>({id:'task-1',title:'Prepare draft',done:false,placement:'pool',startDate:null,endDate:null,expectedVersion:null});
const writeArguments={id:'application-1',expectedRevision:0,requestId:'test-request-12345',confirmed:true};
const applicationTools=['career_list_applications','career_get_application','career_save_application','career_list_application_history','career_restore_application','career_list_jobs','career_get_job','career_list_application_tasks','career_save_application_task','career_save_application_draft'];
const writes=()=>[
  ['career_save_application',{...writeArguments,application:application()},'saveApplication',['application-1',application(),0,'test-request-12345']],
  ['career_restore_application',{...writeArguments,revision:1},'restoreApplication',['application-1',1,0,'test-request-12345']],
  ['career_save_application_task',{...writeArguments,task:task()},'saveApplicationTask',['application-1',task(),0,'test-request-12345']],
  ['career_save_application_draft',{...writeArguments,documentId:'draft-1',document:draft(),expectedDocumentRevision:0},'saveApplicationDraft',['application-1',{documentId:'draft-1',document:draft(),expectedDocumentRevision:0,expectedRevision:0,requestId:'test-request-12345'}]],
];
async function applicationClient(t,{scopes=['career:read','career:write'],checkOwner,overrides={},actor={}}={}) {
  const calls=[];
  let checks=0;
  const services={checkOwner:async()=>{checks++;await checkOwner?.();}};
  const detail={application:{...application(),id:'application-1',revision:1},documents:[],tasks:[],job:null,missingLinks:[]};
  const responses={listApplications:[],getApplication:detail,saveApplication:detail,listApplicationHistory:[],restoreApplication:detail,listJobs:{items:[],total:0,limit:30,offset:0},getJob:{id:'a'.repeat(64)},listApplicationTasks:[],saveApplicationTask:detail,saveApplicationDraft:detail};
  const applications=Object.fromEntries(Object.entries(responses).map(([name,response])=>[name,async(...args)=>{calls.push({name,args});return overrides[name]?overrides[name](...args):response;}]));
  const server=api.createCareerMcp({ownerId:'owner',scopes,...actor},services,applications);
  const [a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'application-test',version:'1'});
  await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  return {client,calls,checks:()=>checks};
}

test('지원 MCP discovery는 기존 8개와 새 10개 도구의 권한·저장 위험·입력 계약을 제공한다',async t=>{
  const {client}=await applicationClient(t);
  const {tools}=await client.listTools();assert.equal(tools.length,18);
  for(const name of applicationTools) {
    const tool=tools.find(value=>value.name===name);assert.ok(tool,name);
    const write=writes().some(([value])=>value===name);
    assert.equal(tool.annotations.readOnlyHint,!write,name);
    assert.equal(tool.annotations.destructiveHint,write,name);
    assert.equal(tool.annotations.idempotentHint,true,name);
    assert.equal(tool.annotations.openWorldHint,false,name);
    assert.deepEqual(tool._meta.securitySchemes[0].scopes,write?['career:read','career:write']:['career:read']);
    assert.equal(tool.inputSchema.additionalProperties,false);
    if(write) {
      assert.ok(tool.inputSchema.required.includes('confirmed'));
      assert.ok(tool.inputSchema.required.includes('requestId'));
      assert.match(tool.inputSchema.properties.confirmed.description,/explicit request/);
    }
  }
  assert.ok(!tools.some(value=>/delete|publish|submit$/.test(value.name)));
});

test('지원·공고·개인 태스크 읽기는 각 호출에서 OWNER를 확인하고 검색 인자를 전달한다',async t=>{
  const {client,calls,checks}=await applicationClient(t,{scopes:['career:read']});
  const reads=[
    ['career_list_applications',{query:'  Test  ',status:'WRITING'},'listApplications',[{query:'Test',status:'WRITING'}]],
    ['career_get_application',{id:'application-1'},'getApplication',['application-1']],
    ['career_list_application_history',{id:'application-1'},'listApplicationHistory',['application-1']],
    ['career_list_jobs',{query:'  Backend  ',status:'OPEN',source:'wanted',page:2},'listJobs',[{query:'Backend',source:'wanted',status:'OPEN',limit:30,offset:30}]],
    ['career_get_job',{id:'a'.repeat(64)},'getJob',['a'.repeat(64)]],
    ['career_list_application_tasks',{},'listApplicationTasks',[undefined]],
    ['career_list_application_tasks',{applicationId:'application-1'},'listApplicationTasks',['application-1']],
  ];
  for(const [name,args,service,expected] of reads) {
    const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,name);
    assert.deepEqual(calls.at(-1),{name:service,args:expected});
  }
  assert.equal(checks(),reads.length);
});

test('새 저장 도구는 read/write scope와 명시적 저장 요청이 모두 있어야 실행된다',async t=>{
  for(const scopes of [[],['career:read'],['career:write']]) {
    const {client,calls}=await applicationClient(t,{scopes});
    for(const [name,args] of writes()) {
      const result=await client.callTool({name,arguments:args});
      assert.equal(result.isError,true);assert.equal(result.structuredContent.error,'MCP_SCOPE_REQUIRED');
      assert.match(result._meta['mcp/www_authenticate'][0],/career:read career:write/);
    }
    assert.equal(calls.length,0);
  }
  const {client,calls}=await applicationClient(t);
  for(const [name,args] of writes()) {
    const result=await client.callTool({name,arguments:{...args,confirmed:false}});
    assert.equal(result.isError,true);assert.equal(result.structuredContent.error,'EXPLICIT_SAVE_REQUIRED');
  }
  assert.equal(calls.length,0);
});

test('지원 읽기 역시 career:read scope 없이 서비스에 접근하지 않는다',async t=>{
  const {client,calls,checks}=await applicationClient(t,{scopes:['career:write']});
  const result=await client.callTool({name:'career_list_application_tasks',arguments:{}});
  assert.equal(result.isError,true);assert.equal(result.structuredContent.status,401);
  assert.equal(checks(),0);assert.equal(calls.length,0);
});

test('OWNER 변경·epoch 취소·만료는 새 읽기와 저장 서비스 실행 전에 차단된다',async t=>{
  for(const code of ['MCP_OWNER_REQUIRED','MCP_UNAUTHORIZED']) {
    const {client,calls,checks}=await applicationClient(t,{checkOwner:()=>{throw new CareerError(code);}});
    for(const [name,args] of [['career_get_application',{id:'application-1'}],...writes()]) {
      const result=await client.callTool({name,arguments:args});assert.equal(result.structuredContent.error,code);
    }
    assert.equal(checks(),5);assert.equal(calls.length,0);
  }
  const {client,calls}=await applicationClient(t,{actor:{oauthEpoch:1,grantDeadline:Math.floor(Date.now()/1000)-1}});
  const result=await client.callTool({name:'career_list_application_tasks',arguments:{}});
  assert.equal(result.structuredContent.error,'MCP_UNAUTHORIZED');assert.equal(calls.length,0);
});

test('저장 재시도는 고정 ID·requestId·revision·task version을 그대로 보존한다',async t=>{
  const {client,calls}=await applicationClient(t);
  for(const [name,args,service,expected] of writes()) {
    const first=await client.callTool({name,arguments:args});
    const retry=await client.callTool({name,arguments:args});
    assert.ok(!first.isError,name);assert.deepEqual(first.structuredContent,retry.structuredContent);
    assert.deepEqual(calls.slice(-2),[{name:service,args:expected},{name:service,args:expected}]);
  }
  const existingTask={...task(),expectedVersion:'b'.repeat(64)};
  await client.callTool({name:'career_save_application_task',arguments:{...writeArguments,task:existingTask,expectedRevision:4}});
  assert.deepEqual(calls.at(-1).args,['application-1',existingTask,4,'test-request-12345']);
});

test('지원·태스크·미평가 초안 입력 오류는 저장 전에 거부된다',async t=>{
  const {client,calls}=await applicationClient(t);
  const invalid=[
    ['career_save_application',{...writeArguments,application:{...application(),experienceIds:['same','same']}}],
    ['career_save_application',{...writeArguments,application:{...application(),status:'EXCLUDED'}}],
    ['career_save_application',{...writeArguments,application:{...application(),deadlineAt:'2026-10-09T09:00:00'}}],
    ['career_save_application',{...writeArguments,application:application(),requestId:'short'}],
    ['career_save_application',{...writeArguments,application:application(),expectedRevision:-1}],
    ['career_save_application',{...writeArguments,application:application(),ownerId:'other'}],
    ['career_save_application_task',{...writeArguments,task:{...task(),startDate:'2026-10-10',endDate:'2026-10-09'}}],
    ['career_save_application_task',{...writeArguments,task:{...task(),expectedVersion:'invalid'}}],
    ['career_save_application_task',{...writeArguments,task:{...task(),projectId:'company'}}],
    ['career_save_application_draft',{...writeArguments,documentId:'draft-1',document:{...draft(),kind:'EXPERIENCE'},expectedDocumentRevision:0}],
    ['career_save_application_draft',{...writeArguments,documentId:'draft-1',document:{...draft(),title:'   '},expectedDocumentRevision:0}],
    ['career_save_application_draft',{...writeArguments,documentId:'draft-1',document:{...draft(),sourceUrls:['file:///private']},expectedDocumentRevision:0}],
    ['career_save_application_draft',{...writeArguments,documentId:'draft-1',document:{...draft(),credentials:{number:'123'}},expectedDocumentRevision:0}],
  ];
  for(const [name,args] of invalid) {
    const result=await client.callTool({name,arguments:args});assert.equal(result.isError,true,JSON.stringify(args));
  }
  assert.equal(calls.length,0);
});

test('리비전·중복 요청 충돌은 409로 보존하고 예상하지 못한 오류 내용은 숨긴다',async t=>{
  for(const [error,code,status] of [
    [new RecruitmentError('최신 리비전을 확인해 주세요.',409),'RECRUITMENT_CONFLICT',409],
    [new RecruitmentError('같은 requestId에 다른 내용을 저장할 수 없습니다.',409),'RECRUITMENT_CONFLICT',409],
    [new RecruitmentError('연결할 자료를 찾을 수 없습니다.',404),'RECRUITMENT_NOT_FOUND',404],
    [new Error('private database connection secret'),'CAREER_SERVICE_UNAVAILABLE',503],
    [new RecruitmentError('private database connection secret',500),'CAREER_SERVICE_UNAVAILABLE',503],
  ]) {
    const {client}=await applicationClient(t,{overrides:{saveApplication:()=>{throw error;}}});
    const [name,args]=writes()[0];const result=await client.callTool({name,arguments:args});
    assert.equal(result.isError,true);assert.equal(result.structuredContent.error,code);assert.equal(result.structuredContent.status,status);
    assert.equal(result.structuredContent.message,status<500?error.message:undefined);
    assert.ok(!JSON.stringify(result).includes('private database'));
  }
  const {client}=await applicationClient(t,{overrides:{getJob:()=>null}});
  const missing=await client.callTool({name:'career_get_job',arguments:{id:'a'.repeat(64)}});
  assert.equal(missing.structuredContent.status,404);
});

test('기존 평가 기반 저장도 confirmed=false를 서비스 호출 전에 거부한다',async t=>{
  let calls=0;
  const server=api.createCareerMcp({ownerId:'owner',scopes:['career:read','career:write']},{checkOwner:async()=>{},save:async()=>{calls++;}});
  const [a,b]=InMemoryTransport.createLinkedPair();const client=new Client({name:'test',version:'1'});await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const result=await client.callTool({name:'career_save_draft',arguments:{sessionId:'a'.repeat(64),input:{documentId:'draft',expectedRevision:0,title:'Draft',project:'',summary:'',confirmed:false,evaluationId:'evaluation',expectedDraftHash:'hash'}}});
  assert.equal(result.structuredContent.error,'EXPLICIT_SAVE_REQUIRED');assert.equal(calls,0);
});
