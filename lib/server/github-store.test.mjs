import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { prisma } from './test-db.mjs';
import { beginGitHubAuthorization, consumeGitHubAuthorization, connectGitHubRepository, loadGitHubRepository, unlinkGitHubRepository, saveGitHubRepositoryLink } from './github-store.ts';

const env={GITHUB_APP_CLIENT_ID:'test-client',GITHUB_APP_SLUG:'test-app',GITHUB_APP_BASE_URL:'http://localhost:30001',OCI_GITHUB_REGION:'ap-seoul-1',OCI_GITHUB_CLIENT_SECRET_ID:'ocid1.vaultsecret.test.client',OCI_GITHUB_TOKEN_SECRET_ID:'ocid1.vaultsecret.test.tokens'};
const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
const keys=['github:oauth-pending','github:repository:personal-ilchul'];
let originalAccount;
let createdProject=false;
before(async()=>{
  Object.assign(process.env,env);
  originalAccount=await prisma.appSetting.findUnique({where:{key:'github:account'}});
  if(!(await prisma.flowProject.findUnique({where:{slug:'personal-ilchul'}}))){
    await prisma.flowProject.create({data:{slug:'personal-ilchul',title:'ilchul',position:9999}});
    createdProject=true;
  }
});
after(async()=>{
  await prisma.appSetting.deleteMany({where:{key:{in:keys}}});
  if(originalAccount)await prisma.appSetting.upsert({where:{key:'github:account'},create:originalAccount,update:{value:originalAccount.value}});
  else await prisma.appSetting.deleteMany({where:{key:'github:account'}});
  if(createdProject)await prisma.flowProject.delete({where:{slug:'personal-ilchul'}});
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await prisma.$disconnect();
});

test('풀링 및 미등록 프로젝트는 조회·연결·해제 모두 차단한다',async()=>{
  for(const slug of ['tns','common','personal-unknown']){
    await assert.rejects(loadGitHubRepository(slug),error=>error.status===404);
    await assert.rejects(connectGitHubRepository(slug,'https://github.com/a/b'),error=>error.status===404);
    await assert.rejects(unlinkGitHubRepository(slug),error=>error.status===404);
  }
});

test('OAuth state와 PKCE는 세션에 묶이며 한 번만 사용할 수 있다',async()=>{
  const auth=await beginGitHubAuthorization('session-a');
  const url=new URL(auth.url);
  const state=url.searchParams.get('state');
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(auth.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:30001/api/github/callback');
  assert.equal(await consumeGitHubAuthorization('session-b',state,auth.verifier),false);
  assert.equal(await consumeGitHubAuthorization('session-a',state,'wrong-verifier'),false);
  assert.equal(await consumeGitHubAuthorization('session-a','wrong-state',auth.verifier),false);
  const attempts=await Promise.all([consumeGitHubAuthorization('session-a',state,auth.verifier),consumeGitHubAuthorization('session-a',state,auth.verifier)]);
  assert.deepEqual(attempts.sort(),[false,true]);
});

test('만료된 OAuth 요청을 거부한다',async()=>{
  const auth=await beginGitHubAuthorization('session');
  const row=await prisma.appSetting.findUnique({where:{key:'github:oauth-pending'}});
  await prisma.appSetting.update({where:{key:row.key},data:{value:{...row.value,expiresAt:0}}});
  assert.equal(await consumeGitHubAuthorization('session',new URL(auth.url).searchParams.get('state'),auth.verifier),false);
});

test('연결 해제는 해당 프로젝트의 링크 설정만 삭제한다',async()=>{
  const projectCount=await prisma.flowProject.count();
  const noteCount=await prisma.projectNote.count();
  const value={id:42,fullName:'owner/repo',url:'https://github.com/owner/repo',private:true,defaultBranch:'main',accountId:7,accountLogin:'owner',verifiedAt:'2026-09-17T00:00:00Z'};
  await prisma.appSetting.upsert({where:{key:keys[1]},create:{key:keys[1],value},update:{value}});
  assert.deepEqual(await loadGitHubRepository('personal-ilchul'),value);
  await unlinkGitHubRepository('personal-ilchul');
  assert.equal(await loadGitHubRepository('personal-ilchul'),null);
  assert.equal(await prisma.flowProject.count(),projectCount);
  assert.equal(await prisma.projectNote.count(),noteCount);
});

test('검증 결과를 기존 프로젝트에 저장하고 계정 교체 충돌 시 이전 링크를 보존한다',async()=>{
  const account={id:7,login:'owner'};
  await prisma.appSetting.upsert({where:{key:'github:account'},create:{key:'github:account',value:account},update:{value:account}});
  const projectBefore=await prisma.flowProject.findUnique({where:{slug:'personal-ilchul'}});
  const repository={id:42,fullName:'owner/repo',url:'https://github.com/owner/repo',private:true,defaultBranch:'main'};
  const saved=await saveGitHubRepositoryLink('personal-ilchul',account,repository);
  assert.deepEqual(await loadGitHubRepository('personal-ilchul'),saved);
  assert.equal(saved.accountId,7);
  assert.deepEqual(await prisma.flowProject.findUnique({where:{slug:'personal-ilchul'}}),projectBefore);
  await prisma.appSetting.update({where:{key:'github:account'},data:{value:{id:8,login:'different'}}});
  await assert.rejects(saveGitHubRepositoryLink('personal-ilchul',account,{...repository,id:99}),error=>error.status===409);
  assert.deepEqual(await loadGitHubRepository('personal-ilchul'),saved);
});
