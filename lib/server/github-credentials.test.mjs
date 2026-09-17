import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { prisma } from './test-db.mjs';
import { createGitHubStore } from './github-store.ts';

let secret='{}', failWrite=false, denied=false;
let createdProject=false;
const fakePat='github_pat_'+'a'.repeat(60);
const account={id:7,login:'owner'};
const repository={id:42,fullName:'team/repo',url:'https://github.com/team/repo',private:true,defaultBranch:'main'};
const store=createGitHubStore({
  configured:()=>true,
  readSecret:async()=>secret,
  writeSecret:async value=>{if(failWrite)throw new Error('secret write failed');secret=JSON.stringify(value);},
  getUser:async()=>account,
  verifyRepository:async()=>{if(denied)throw new Error('denied');return repository;},
});
const input=(label='조직 토큰')=>({label,token:fakePat,expiresOn:new Date(Date.now()+86400000*30).toISOString().slice(0,10)});
before(async()=>{
  if(!(await prisma.flowProject.findUnique({where:{slug:'personal-ilchul'}}))){
    await prisma.flowProject.create({data:{slug:'personal-ilchul',title:'ilchul',position:9999}});createdProject=true;
  }
});
beforeEach(async()=>{
  secret='{}';failWrite=false;denied=false;
  await prisma.appSetting.deleteMany({where:{key:'github:repository:personal-ilchul'}});
});
after(async()=>{
  await prisma.appSetting.deleteMany({where:{key:'github:repository:personal-ilchul'}});
  if(createdProject)await prisma.flowProject.delete({where:{slug:'personal-ilchul'}});
  await prisma.$disconnect();
});

test('개인 PAT 검증 후 보안 저장소에 저장하며 상태 응답과 DB에 토큰을 남기지 않는다',async()=>{
  const result=await store.registerCredential(input());
  assert.equal(result.accountLogin,'owner');
  assert.equal('token' in result,false);
  const status=await store.connectionStatus();
  assert.equal(status.credentials.length,1);
  assert.equal(JSON.stringify(status).includes(fakePat),false);
  const saved=await store.connectRepository('personal-ilchul',repository.url,result.id);
  assert.equal(saved.credentialId,result.id);
  assert.equal(saved.fullName,'team/repo');
  assert.equal(JSON.stringify(await prisma.appSetting.findUnique({where:{key:'github:repository:personal-ilchul'}})).includes(fakePat),false);
});

test('여러 소유자 범위의 토큰을 보존하고 프로젝트마다 선택한다',async()=>{
  const first=await store.registerCredential(input('개인'));
  const second=await store.registerCredential({...input('조직'),token:'github_pat_'+'b'.repeat(60)});
  assert.equal((await store.connectionStatus()).credentials.length,2);
  await store.connectRepository('personal-ilchul',repository.url,second.id);
  await store.removeCredential(first.id);
  assert.deepEqual((await store.connectionStatus()).credentials.map(c=>c.id),[second.id]);
  assert.equal((await store.loadRepository('personal-ilchul')).credentialId,second.id);
});

test('토큰 삭제 후 사용을 차단하며 프로젝트·기존 링크는 보존한다',async()=>{
  const credential=await store.registerCredential(input());
  const saved=await store.connectRepository('personal-ilchul',repository.url,credential.id);
  await store.removeCredential(credential.id);
  await assert.rejects(store.connectRepository('personal-ilchul',repository.url,credential.id),error=>error.status===401);
  assert.deepEqual(await store.loadRepository('personal-ilchul'),saved);
  assert.ok(await prisma.flowProject.findUnique({where:{slug:'personal-ilchul'}}));
});

test('잘못된·만료된 토큰과 보안 저장 실패는 등록 성공으로 처리하지 않는다',async()=>{
  await assert.rejects(store.registerCredential({...input(),token:'ghu_app'}));
  failWrite=true;
  await assert.rejects(store.registerCredential(input()));
  assert.equal((await store.connectionStatus()).credentials.length,0);
  failWrite=false;
  const credential=await store.registerCredential(input());
  const data=JSON.parse(secret);data.credentials[0].expiresAt=0;secret=JSON.stringify(data);
  await assert.rejects(store.connectRepository('personal-ilchul',repository.url,credential.id),error=>error.status===401);
});

test('권한 검증 실패 시 이전 레포 연결을 덮어쓰지 않는다',async()=>{
  const credential=await store.registerCredential(input());
  const saved=await store.connectRepository('personal-ilchul',repository.url,credential.id);
  denied=true;
  await assert.rejects(store.connectRepository('personal-ilchul','https://github.com/other/repo',credential.id));
  assert.deepEqual(await store.loadRepository('personal-ilchul'),saved);
});

test('풀링 및 미등록 프로젝트의 조회·연결·해제는 차단한다',async()=>{
  for(const slug of ['tns','common','personal-unknown']){
    await assert.rejects(store.loadRepository(slug),error=>error.status===404);
    await assert.rejects(store.connectRepository(slug,repository.url,'id'),error=>error.status===404);
    await assert.rejects(store.unlinkRepository(slug),error=>error.status===404);
  }
});
