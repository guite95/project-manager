import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { prisma, resetDatabase } from './test-db.mjs';
import { emptyApplication } from '../recruitment-applications.ts';
import { careerAuthorization } from '../career/authorization-context.ts';
import { PERSONAL_ISSUES_SLUG } from '../today-board.ts';
import { createIssue, loadBoard, moveIssue, movePoolIssues, setIssueDone, setIssueTitle } from './board-store.ts';
import { readTodayTasks } from './project-tasks.ts';
import * as api from './recruitment-applications-store.ts';
const ownerId='application-test-owner', adminId='application-test-admin';
const input = (overrides={}) => ({...emptyApplication(),company:'예시 회사',role:'개발자',...overrides});
const request = n => `application-test-${n}`;
const save = (id,value=input(),revision=0,key=request(id)) => api.saveApplication(ownerId,id,value,revision,key);
beforeEach(async () => {
  await resetDatabase();
  await prisma.appSetting.deleteMany({where:{key:{startsWith:'recruitment:'}}});
  for(const [id,role] of [[ownerId,'OWNER'],[adminId,'ADMIN']]) await prisma.accessUser.upsert({where:{id},create:{id,username:id,name:'가상 테스트',passwordHash:'test-only',role,active:true},update:{active:true,role,oauthEpoch:0}});
});
after(async () => {
  await resetDatabase();
  await prisma.appSetting.deleteMany({where:{key:{startsWith:'recruitment:'}}});
  await prisma.accessUser.deleteMany({where:{id:{in:[ownerId,adminId]}}});
  await prisma.$disconnect();
});
test('읽기는 쓰지 않고 OWNER만 지원 건과 개인 태스크에 접근한다', async () => {
  assert.deepEqual(await api.listApplications(ownerId),[]);
  await assert.rejects(()=>api.getApplication(ownerId,'missing'),e=>e.status===404);
  assert.equal(await prisma.appSetting.count({where:{key:{startsWith:'recruitment:'}}}),0);
  for(const id of [adminId,'unknown']) {
    await assert.rejects(()=>api.listApplications(id),e=>e.status===403);
    await assert.rejects(()=>api.saveApplication(id,'a',input(),0,request('denied')),e=>e.status===403);
  }
});
test('revision 경쟁은 한 요청만 저장하고 멱등 재시도는 이력을 추가하지 않는다', async () => {
  const created=await save('a');
  assert.equal(created.application.revision,1);
  assert.deepEqual(await save('a'),created);
  await assert.rejects(()=>save('a',input({role:'다른 직무'})),e=>e.status===409);
  const outcomes=await Promise.allSettled(['첫 편집','다른 편집'].map((nextAction,i)=>save('a',input({nextAction}),1,request(`edit-${i}`))));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await api.listApplicationHistory(ownerId,'a')).length,2);
  const restored=await api.restoreApplication(ownerId,'a',1,2,request('restore'));
  assert.equal(restored.application.revision,3);
  assert.equal(restored.application.nextAction,'');
  assert.equal((await api.listApplicationHistory(ownerId,'a')).length,3);
});
test('자료 종류와 존재를 검사하고 상세에서 삭제된 연결을 표시한다', async () => {
  const doc={id:'experience',kind:'EXPERIENCE',title:'경험',project:'예시',scope:'PERSONAL',summary:'요약',sections:[{title:'근거',body:'비공개 본문'}],sourceUrls:[],tags:[],revision:1,updatedAt:new Date().toISOString()};
  await prisma.appSetting.create({data:{key:'recruitment:document:experience',value:doc}});
  await assert.rejects(()=>save('bad',input({coverLetterIds:['experience']})),e=>e.status===400);
  await assert.rejects(()=>save('bad',input({experienceIds:['missing']})),e=>e.status===400);
  const detail=await save('a',input({experienceIds:['experience'],notes:'메모'}));
  assert.equal(detail.documents[0].kind,'EXPERIENCE');
  assert.equal('sections' in detail.documents[0],false);
  assert.equal('notes' in (await api.listApplications(ownerId))[0],false);
  await prisma.appSetting.delete({where:{key:'recruitment:document:experience'}});
  assert.deepEqual((await api.getApplication(ownerId,'a')).missingLinks,['experience']);
});
test('마감 정렬은 시간대를 반영하고 미정 마감은 뒤에 표시한다',async()=>{
  await save('unknown');
  await save('later',input({deadlineAt:'2026-10-09T01:00:00Z'}));
  await save('earlier',input({deadlineAt:'2026-10-09T09:00:00+09:00'}));
  assert.deepEqual((await api.listApplications(ownerId)).map(row=>row.id),['earlier','later','unknown']);
});
test('문서와 태스크의 ID가 같아도 삭제된 연결을 독립적으로 찾는다',async()=>{
  const doc={id:'shared-id',kind:'EXPERIENCE',title:'경험',project:'예시',scope:'PERSONAL',summary:'요약',sections:[{title:'경험',body:'확인한 내용'}],sourceUrls:[],tags:[],revision:1,updatedAt:new Date().toISOString()};
  await prisma.appSetting.create({data:{key:'recruitment:document:shared-id',value:doc}});
  await createIssue({id:'shared-id',projectSlug:PERSONAL_ISSUES_SLUG,title:'개인 할 일',now:'2026-10-09T00:00:00Z'});
  await save('a',input({experienceIds:['shared-id'],taskIds:['shared-id']}));
  await prisma.issue.delete({where:{id:'shared-id'}});
  assert.deepEqual((await api.getApplication(ownerId,'a')).missingLinks,['shared-id']);
});
test('후보 태스크는 미연결 또는 같은 지원 건만 포함하고 연결 해제 후에도 다른 건에 넘기지 않는다',async()=>{
  for(const id of ['free','first','second']) await createIssue({id,projectSlug:PERSONAL_ISSUES_SLUG,title:id,now:'2026-10-09T00:00:00Z'});
  await save('a',input({taskIds:['first']}));
  await save('b',input({taskIds:['second']}));
  const ids=async applicationId=>(await api.listApplicationTasks(ownerId,applicationId)).map(row=>row.id).sort();
  assert.deepEqual(await ids(),['free']);
  assert.deepEqual(await ids('a'),['first','free']);
  assert.deepEqual(await ids('new-application'),['free']);
  await save('a',input(),1,request('unlink-filter'));
  assert.deepEqual(await ids('b'),['free','second']);
  await assert.rejects(()=>save('b',input({taskIds:['first']}),1,request('reassign')),e=>e.status===409);
});
test('지원 태스크는 원본 issue/일정을 재사용하고 CLI와 회사 이동에서 제외된다', async () => {
  await save('a');
  const task={id:'career-task',title:'초안 작성',done:false,placement:'today',startDate:'2026-10-09',endDate:'2026-10-12',expectedVersion:null};
  const detail=await api.saveApplicationTask(ownerId,'a',task,1,request('task-create'));
  assert.deepEqual(detail.application.taskIds,['career-task']);
  assert.equal(detail.tasks[0].endDate,task.endDate);
  assert.equal((await prisma.issue.findUnique({where:{id:task.id}})).projectSlug,PERSONAL_ISSUES_SLUG);
  assert.deepEqual(await api.saveApplicationTask(ownerId,'a',task,1,request('task-create')),detail);
  const board=await loadBoard('2026-10-09',{hiddenProjectSlugs:[]});
  assert.ok(board.today.some(row=>row.id===task.id));
  assert.equal((await readTodayTasks(prisma,{status:'all'},new Date('2026-10-09T00:00:00Z'))).tasks.some(row=>row.id===task.id),false);
  await moveIssue(task.id,'pool','2026-10-09');
  await prisma.customProject.create({data:{slug:'company',title:'회사',createdAt:new Date()}});
  await assert.rejects(()=>movePoolIssues({ids:[task.id],action:'project',projectSlug:'company'},undefined),e=>e.status===409 && /개인 영역/.test(e.message));
  await setIssueTitle(task.id,'수정한 제목');
  await assert.rejects(()=>api.saveApplicationTask(ownerId,'a',{...task,expectedVersion:detail.tasks[0].version},2,request('stale-task')),e=>e.status===409);
});
test('개인 태스크만 연결 가능하고 연결 해제 후에도 사생활 표시와 완료 원본이 보존된다',async()=>{
  await createIssue({id:'private',projectSlug:PERSONAL_ISSUES_SLUG,title:'지원 준비',now:'2026-10-08T00:00:00Z'});
  await createIssue({id:'company',projectSlug:'company',title:'회사 일',now:'2026-10-08T00:00:00Z'});
  await assert.rejects(()=>save('bad',input({taskIds:['company']})),e=>e.status===400);
  await save('a',input({taskIds:['private']}));
  await save('a',input(),1,request('unlink'));
  await moveIssue('private','today','2026-10-08');
  await setIssueDone({id:'private',done:true,completionId:'completed',today:'2026-10-08',now:'2026-10-08T00:00:00Z'});
  await loadBoard('2026-10-09');
  assert.equal((await prisma.issue.findUnique({where:{id:'private'}})).placement,'archive');
  assert.equal(await prisma.completion.count({where:{issueId:'private'}}),1);
});
test('초안 저장과 지원 건 연결은 원자적이고 stale 문서는 덮어쓰지 않는다',async()=>{
  await save('a');
  const draft={documentId:'draft',document:{kind:'COVER_LETTER',title:'지원동기',project:'예시 회사',scope:'GENERAL',summary:'초안',tags:[],sections:[{title:'지원동기',body:'확인한 경험을 바탕으로 작성'}],sourceUrls:[]},expectedDocumentRevision:0,expectedRevision:1,requestId:request('draft')};
  const saved=await api.saveApplicationDraft(ownerId,'a',draft);
  assert.deepEqual(saved.application.coverLetterIds,['draft']);
  assert.deepEqual(await api.saveApplicationDraft(ownerId,'a',draft),saved);
  await assert.rejects(()=>api.saveApplicationDraft(ownerId,'a',{...draft,expectedRevision:2,requestId:request('stale-draft')}),e=>e.status===409);
  assert.equal((await api.getApplication(ownerId,'a')).application.revision,2);
  assert.equal((await prisma.appSetting.findUnique({where:{key:'recruitment:document:draft'}})).value.revision,1);
});
test('완료 재시도는 이력을 중복 생성하지 않고 연결 검증 실패 시 초안도 롤백한다',async()=>{
  await save('a');
  const task={id:'done-task',title:'완료한 개인 할 일',done:true,placement:'pool',startDate:null,endDate:null,expectedVersion:null};
  const saved=await api.saveApplicationTask(ownerId,'a',task,1,request('done'));
  assert.equal(saved.tasks[0].placement,'archive');
  assert.deepEqual(await api.saveApplicationTask(ownerId,'a',task,1,request('done')),saved);
  assert.equal(await prisma.completion.count({where:{issueId:task.id}}),1);
  await prisma.issue.delete({where:{id:task.id}});
  await assert.rejects(()=>api.saveApplicationDraft(ownerId,'a',{
    documentId:'rollback-draft',document:{kind:'COVER_LETTER',title:'초안',project:'예시',scope:'GENERAL',summary:'',tags:[],sections:[{title:'지원동기',body:'확인한 경험을 서술한 내용'}],sourceUrls:[]},
    expectedDocumentRevision:0,expectedRevision:2,requestId:request('rollback-draft'),
  }),e=>e.status===400 && /개인 할 일만 연결/.test(e.message));
  assert.equal(await prisma.appSetting.count({where:{key:{in:['recruitment:document:rollback-draft','recruitment:draft-history:rollback-draft:1']}}}),0);
  assert.equal((await api.getApplication(ownerId,'a')).application.revision,2);
});
test('토큰 폐기·grant 만료를 저장 트랜잭션 안에서도 다시 확인한다',async()=>{
  await save('a');
  for(const auth of [{ownerId,scopes:['career:write'],oauthEpoch:1,grantDeadline:Date.now()/1000+60},{ownerId,scopes:['career:write'],oauthEpoch:0,grantDeadline:Date.now()/1000-1}]) {
    await assert.rejects(()=>careerAuthorization.run(auth,()=>save('a',input(),1,request('revoked'))),e=>e.status===403);
  }
  assert.equal((await api.getApplication(ownerId,'a')).application.revision,1);
});
