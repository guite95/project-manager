import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {z} from 'zod';
import {RecruitmentError} from '../recruitment.ts';
import * as applications from '../recruitment-applications.ts';

// 실제 라우트와 세션 권한/JSON 검증을 실행하고 Next 런타임과 DB 저장소만 대체한다.
function load(relative,imports) {
  const output=ts.transpileModule(readFileSync(new URL(relative,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const module={exports:{}};
  new Function('require','module','exports',output)(name=>{
    if(!Object.hasOwn(imports,name))throw new Error(`Unexpected test import: ${name}`);
    return imports[name];
  },module,module.exports);
  return module.exports;
}
class AccessError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
function harness() {
  let actor={id:'verified-owner',role:'OWNER'};
  let failure=null;
  const calls=[];
  const detail={application:{...applications.emptyApplication(),id:'application-1',company:'Test company',role:'Developer',revision:2},documents:[],tasks:[],job:null,missingLinks:[]};
  const next={NextResponse:{json:(body,init)=>Response.json(body,init)}};
  const http=load('../access/http.ts',{
    'next/headers':{cookies:async()=>({get:()=>undefined})},'next/server':next,react:{cache:fn=>fn},
    '../server/task-access.ts':{},'../session.ts':{},'./store.ts':{AccessError,resolveActor:async()=>actor},
  });
  const recruitment=load('./recruitment-http.ts',{
    'next/server':next,'../access/http.ts':http,'../access/store.ts':{AccessError},'../recruitment.ts':{RecruitmentError},
  });
  const responses={listApplications:[],getApplication:detail,saveApplication:detail,listApplicationTasks:[],saveApplicationTask:detail,listApplicationHistory:[{revision:1,updatedAt:'2026-10-09T00:00:00Z',action:'SAVE'}],restoreApplication:detail};
  const store=Object.fromEntries(Object.entries(responses).map(([name,result])=>[name,async(...args)=>{
    calls.push([name,...args]);if(failure)throw failure;return result;
  }]));
  const imports={
    'next/server':next,zod:{z},'@/lib/access/http':http,'@/lib/recruitment-applications':applications,
    '@/lib/server/recruitment-http':recruitment,'@/lib/server/recruitment-applications-store':store,
  };
  return {
    calls,detail,actor:value=>{actor=value;},failure:value=>{failure=value;},
    list:load('../../app/api/recruitment/applications/route.ts',imports),
    item:load('../../app/api/recruitment/applications/[id]/route.ts',imports),
    tasks:load('../../app/api/recruitment/applications/tasks/route.ts',imports),
    task:load('../../app/api/recruitment/applications/[id]/tasks/route.ts',imports),
    history:load('../../app/api/recruitment/applications/[id]/history/route.ts',imports),
    restore:load('../../app/api/recruitment/applications/[id]/restore/route.ts',imports),
  };
}
const base='https://app.test/api/recruitment/applications';
const context={params:Promise.resolve({id:'application-1'})};
const application=()=>({...applications.emptyApplication(),company:'Test company',role:'Developer'});
const task=()=>({id:'task-1',title:'Prepare draft',done:false,placement:'pool',startDate:'2026-10-09',endDate:'2026-10-10',expectedVersion:'a'.repeat(64)});
const requestId='application-http-request-1';
const saveBody=()=>({application:application(),expectedRevision:1,requestId});
const taskBody=()=>({task:task(),expectedRevision:1,requestId});
const restoreBody=()=>({revision:1,expectedRevision:2,requestId});
function request(path='',method='GET',body,options={}) {
  const {origin='https://app.test',contentType='application/json',headers={}}=options;
  return new Request(base+path,{method,headers:{...(origin?{origin}:{}),'Content-Type':contentType,...headers},
    ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
}
function mutations(h) {
  return [
    {run:(body,options)=>h.item.PUT(request('/application-1','PUT',body,options),context),body:saveBody()},
    {run:(body,options)=>h.task.POST(request('/application-1/tasks','POST',body,options),context),body:taskBody()},
    {run:(body,options)=>h.restore.POST(request('/application-1/restore','POST',body,options),context),body:restoreBody()},
  ];
}
const privateResponse=response=>assert.equal(response.headers.get('Cache-Control'),'private, no-store');

test('지원 API 자체가 비로그인·ADMIN·MEMBER를 모든 읽기와 쓰기 저장소 접근 전에 거부한다',async()=>{
  const h=harness();
  for(const actor of [null,{id:'admin',role:'ADMIN'},{id:'member',role:'MEMBER'}]) {
    h.actor(actor);
    const responses=[
      await h.list.GET(request()),await h.item.GET(request('/application-1'),context),
      await h.tasks.GET(request('/tasks')),await h.history.GET(request('/application-1/history'),context),
      ...await Promise.all(mutations(h).map(({run,body})=>run(body,{headers:{'x-user-id':'verified-owner','x-user-role':'OWNER'}}))),
    ];
    for(const response of responses){assert.equal(response.status,actor?403:401);privateResponse(response);}
  }
  assert.deepEqual(h.calls,[]);
});

test('지원 API는 검증된 OWNER ID와 선택한 지원 ID를 읽기·저장 함수에 전달한다',async()=>{
  const h=harness();
  const reads=[
    await h.list.GET(request('?q=Developer&status=WRITING')),
    await h.item.GET(request('/application-1'),context),
    await h.tasks.GET(request('/tasks')),
    await h.history.GET(request('/application-1/history'),context),
  ];
  for(const response of reads){assert.equal(response.status,200);privateResponse(response);}
  assert.deepEqual(h.calls.slice(0,2),[
    ['listApplications','verified-owner',{query:'Developer',status:'WRITING'}],
    ['getApplication','verified-owner','application-1'],
  ]);
  assert.deepEqual(h.calls[2],['listApplicationTasks','verified-owner',undefined]);
  assert.deepEqual(h.calls[3],['listApplicationHistory','verified-owner','application-1']);
  for(const {run,body} of mutations(h)){
    const response=await run(body,{headers:{'x-user-id':'spoofed','x-user-role':'ADMIN'}});
    assert.equal(response.status,200);privateResponse(response);assert.deepEqual(await response.json(),h.detail);
  }
  assert.deepEqual(h.calls.slice(4),[
    ['saveApplication','verified-owner','application-1',application(),1,requestId],
    ['saveApplicationTask','verified-owner','application-1',task(),1,requestId],
    ['restoreApplication','verified-owner','application-1',1,2,requestId],
  ]);
  const candidates=await h.tasks.GET(request('/tasks?applicationId=application-1'));
  assert.equal(candidates.status,200);privateResponse(candidates);
  assert.deepEqual(h.calls.at(-1),['listApplicationTasks','verified-owner','application-1']);
});

test('지원 API 쓰기는 같은 출처 JSON과 정해진 본문만 저장소에 전달한다',async()=>{
  const h=harness();
  for(const {run,body} of mutations(h)) {
    for(const [input,options,status] of [
      [body,{origin:'https://other.test'},403],[body,{origin:''},403],
      [body,{contentType:'text/plain'},415],['[]',{},400],['null',{},400],['{',{},400],
      [{...body,ownerId:'spoofed'}, {},400],[{...body,confirmed:true}, {},400],
      [{...body,expectedRevision:-1},{},400],[{...body,expectedRevision:1.5},{},400],
      [{...body,requestId:'short'},{},400],[{...body,requestId:'invalid request id'},{},400],
    ]) {
      const response=await run(input,options);assert.equal(response.status,status);privateResponse(response);
    }
  }
  assert.deepEqual(h.calls,[]);
});

test('지원·태스크 날짜 및 문서 연결 입력은 route에서 검사하고 부분 저장하지 않는다',async()=>{
  const h=harness();
  const invalidApplications=[
    {...application(),deadlineAt:'2026-10-09T09:00:00'},
    {...application(),deadlineAt:'2026-02-30T09:00:00+09:00'},
    {...application(),status:'EXCLUDED',exclusionReason:'  '},
    {...application(),coverLetterIds:['duplicate','duplicate']},
    {...application(),credentials:{registrationNumber:'private'}},
  ];
  for(const value of invalidApplications){
    const response=await h.item.PUT(request('/application-1','PUT',{...saveBody(),application:value}),context);
    assert.equal(response.status,400);privateResponse(response);
  }
  const invalidTasks=[
    {...task(),startDate:'2026-02-30'},{...task(),endDate:null},{...task(),endDate:'2026-10-08'},
    {...task(),expectedVersion:'invalid'},{...task(),placement:'company'},{...task(),projectSlug:'company'},
  ];
  for(const value of invalidTasks){
    const response=await h.task.POST(request('/application-1/tasks','POST',{...taskBody(),task:value}),context);
    assert.equal(response.status,400);privateResponse(response);
  }
  for(const body of [{...restoreBody(),revision:0},{...restoreBody(),revision:1.5},{...restoreBody(),expectedRevision:0}]){
    assert.equal((await h.restore.POST(request('/application-1/restore','POST',body),context)).status,400);
  }
  assert.deepEqual(h.calls,[]);
  const valid={...saveBody(),application:{...application(),deadlineAt:'2026-10-09T09:00:00+09:00'}};
  assert.equal((await h.item.PUT(request('/application-1','PUT',valid),context)).status,200);
  assert.equal(h.calls[0][3].deadlineAt,'2026-10-09T09:00:00+09:00');
});

test('지원 API는 저장 충돌 메시지를 409로 전달하고 예상하지 못한 오류는 감춘다',async()=>{
  const h=harness();
  const message='다른 화면에서 내용이 변경되었습니다. 작성 내용을 유지해 주세요.';
  h.failure(new RecruitmentError(message,409));
  for(const {run,body} of mutations(h)){
    const response=await run(body);assert.equal(response.status,409);privateResponse(response);
    assert.deepEqual(await response.json(),{message});
  }
  h.failure(new RecruitmentError('지원 건을 찾을 수 없습니다.',404));
  const missing=await h.item.GET(request('/application-1'),context);assert.equal(missing.status,404);privateResponse(missing);
  h.failure(new Error('private database connection secret'));
  const unavailable=await h.item.GET(request('/application-1'),context);assert.equal(unavailable.status,503);privateResponse(unavailable);
  assert.ok(!(await unavailable.text()).includes('private database'));
});

test('지원 API는 응답 유실 후에도 같은 requestId와 수정 버전을 그대로 저장소에 전달한다',async()=>{
  const h=harness();
  for(const {run,body} of mutations(h)){
    assert.equal((await run(body)).status,200);assert.equal((await run(body)).status,200);
    assert.deepEqual(h.calls.at(-1),h.calls.at(-2));
    assert.equal(h.calls.at(-1).at(-1),requestId);
  }
});
