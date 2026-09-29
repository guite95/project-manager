import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {prisma} from './test-db.mjs';
import {fixture,decisions} from '../career/fixtures.mjs';
import {hash} from '../career/core.ts';
const api=await import('./career-store.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const owner='test-career-owner',other='test-career-other';const keys=[];
after(async()=>{await prisma.appSetting.deleteMany({where:{key:{in:keys}}});await prisma.accessUser.deleteMany({where:{id:{in:[owner,other]}}});await prisma.$disconnect();});
test('OWNER 세션을 영속화하고 중복 시작은 재과금하지 않으며 타 소유자는 읽지 못한다',async()=>{
  assert.equal(typeof api.startCareerEvaluation,'function');
  await prisma.accessUser.upsert({where:{id:owner},create:{id:owner,username:owner,name:'가상 테스트',passwordHash:'unused',role:'OWNER',active:true},update:{active:true,role:'OWNER'}});
  await prisma.accessUser.upsert({where:{id:other},create:{id:other,username:other,name:'가상 테스트',passwordHash:'unused',role:'MEMBER',active:true},update:{active:true,role:'MEMBER'}});
  let calls=0;const provider=async req=>{calls++;return decisions(req.questions);};
  const requestId=crypto.randomUUID();
  const r=await api.startCareerEvaluation(owner,fixture(),requestId,provider);keys.push(`career:session:${r.id}`);
  assert.equal(r.state,'COMPLETE');assert.equal(r.history[0].result.status,'PASS');assert.equal(r.providerAttempts,2);
  const duplicate=await api.startCareerEvaluation(owner,fixture(),requestId,provider);assert.equal(duplicate.id,r.id);assert.equal(calls,2);
  await assert.rejects(api.getCareerSession(other,r.id),/MCP_OWNER_REQUIRED/);
  const changed=fixture();changed.mode='DIAGNOSE';await assert.rejects(api.startCareerEvaluation(owner,changed,requestId,provider),/IDEMPOTENCY_CONFLICT/);
  const documentId=crypto.randomUUID();keys.push(`recruitment:document:${documentId}`);
  const options={documentId,expectedRevision:0,title:'가상 테스트',project:'',summary:'',confirmed:true,evaluationId:r.history[0].result.identity.evaluationId,expectedDraftHash:r.history[0].result.identity.draftHash};
  await assert.rejects(api.saveCareerDraft(owner,r.id,{...options,confirmed:false}),/EXPLICIT_SAVE_REQUIRED/);
  const saved=await api.saveCareerDraft(owner,r.id,options);assert.equal(saved.revision,1);assert.equal(saved.sections[0].body,fixture().answers[0].text);
  const repeat=await api.saveCareerDraft(owner,r.id,options);assert.equal(repeat.revision,1);
  await prisma.accessUser.update({where:{id:owner},data:{active:false}});
  await assert.rejects(api.getCareerSession(owner,r.id),/MCP_OWNER_REQUIRED/);
});

test('동시 최초 요청은 한 번만 과금하고 RUNNING 상태를 읽기만 한다',async()=>{
  await prisma.accessUser.upsert({where:{id:owner},create:{id:owner,username:owner,name:'가상 테스트',passwordHash:'unused',role:'OWNER',active:true},update:{active:true}});
  const requestId=crypto.randomUUID(),id=hash([owner,requestId]).slice(7);keys.push(`career:session:${id}`);
  let release,signalStarted;const wait=new Promise(resolve=>release=resolve),started=new Promise(resolve=>signalStarted=resolve);let calls=0;
  const provider=async req=>{calls++;signalStarted();await wait;return decisions(req.questions);};
  const first=api.startCareerEvaluation(owner,fixture(),requestId,provider);await started;
  try {const duplicate=await api.startCareerEvaluation(owner,fixture(),requestId,provider);assert.equal(duplicate.state,'RUNNING');assert.equal(duplicate.providerAttempts,1);assert.equal(calls,1);assert.ok(duplicate.progress?.coverage.plannedCheckIds.length);}
  finally {release();await first;}
  const complete=await first;assert.equal(complete.state,'COMPLETE');assert.equal(calls,2);
});

test('원고 저장 충돌은 평가 세션과 현재 문서를 함께 보존한다',async()=>{
  await prisma.accessUser.update({where:{id:owner},data:{active:true}});
  const r=await api.startCareerEvaluation(owner,fixture(),crypto.randomUUID(),async req=>decisions(req.questions));keys.push(`career:session:${r.id}`);
  const documentId=crypto.randomUUID(),docKey=`recruitment:document:${documentId}`;keys.push(docKey);
  await prisma.appSetting.create({data:{key:docKey,value:{kind:'COVER_LETTER',revision:1,sections:[{title:'다른 편집',body:'보존 원문'}]}}});
  const result=r.history[0].result;
  await assert.rejects(api.saveCareerDraft(owner,r.id,{documentId,expectedRevision:0,title:'가상',project:'',summary:'',confirmed:true,evaluationId:result.identity.evaluationId,expectedDraftHash:result.identity.draftHash}),/DOCUMENT_CONFLICT/);
  assert.equal((await prisma.appSetting.findUnique({where:{key:docKey}})).value.sections[0].body,'보존 원문');
  assert.equal((await api.getCareerSession(owner,r.id)).saved,null);
});
