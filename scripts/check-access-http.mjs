/** 빌드한 Next 앱을 로컬 테스트 DB에서만 기동해 실제 HTTP 권한 경계를 검증한다. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { assertTestDatabase } from '../lib/test-database.ts';
assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const {prisma}=await import('../lib/db.ts');
const {hashPassword}=await import('../lib/password.ts');
const {issueSession,manageAccess,tokenHash}=await import('../lib/access/store.ts');
const prefix=`http-${randomUUID().slice(0,8)}`;
const project=`${prefix}-project`, other=`${prefix}-other`;
const owner={id:`${prefix}-owner`,role:'OWNER',memberships:[]};
const users=[owner,{id:`${prefix}-admin`,role:'ADMIN'},{id:`${prefix}-viewer`,role:'MEMBER'},{id:`${prefix}-editor`,role:'MEMBER'}];
const chart={slug:'document',title:'HTTP 테스트 문서',nodes:[],edges:[],content:{kind:'notice',text:'only this document'}};
let child,checks=0,accountTableRenamed=false;
try {
  const passwordHash=await hashPassword('local-test-password-only');
  for(const user of users) await prisma.accessUser.create({data:{id:user.id,username:user.id,name:user.id,role:user.role,passwordHash}});
  for(const slug of [project,other]) await prisma.flowProject.create({data:{slug,title:slug,position:999,categories:{create:{slug:'work',title:'Work',position:0,charts:{create:{slug:chart.slug,position:0,document:chart}}}}}});
  for(const [index,role] of [[2,'VIEWER'],[3,'EDITOR']]) await prisma.accessMembership.create({data:{userId:users[index].id,projectSlug:project,role}});
  const cookies=await Promise.all(users.map(async user=>`pm_session=${await issueSession(user.id)}`));
  const share=await manageAccess(owner,{action:'share',projectSlug:project,chartSlug:chart.slug,days:1});
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p',String(port)],{env:{...process.env,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
  // 서버 응답/로그에 세션이나 페이지 본문을 출력하지 않는다.
  child.stdout.resume();child.stderr.resume();
  let ready=false;
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null) throw new Error('테스트 서버 기동 실패');
    try {if((await fetch(`${base}/login`)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'test server ready');
  async function check(path,status,{user,method='GET',body,origin=base}={}) {
    const response=await fetch(`${base}${path}`,{method,redirect:'manual',headers:{...(user===undefined?{}:{cookie:cookies[user]}),...(method==='GET'?{}:{origin,'content-type':'application/json'})},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal(response.status,status,`${method} ${path.split('/').slice(0,2).join('/')} status`);checks++;
    return response;
  }
  await check('/api/flows/navigation',401);
  await check('/flows',307);
  const login=await check('/api/login',204,{method:'POST',body:{username:users[2].id,password:'local-test-password-only'}});
  assert.match(login.headers.get('set-cookie'),/HttpOnly/i);assert.match(login.headers.get('set-cookie'),/Secure/i);checks+=2;
  await check('/api/login',401,{method:'POST',body:{username:'',password:'local-test-password-only'}});
  const invited=await (await check('/api/access',200,{user:0,method:'POST',body:{action:'invite',username:`${prefix}-invited`,name:'Invited',role:'MEMBER'}})).json();
  await check('/api/invite',204,{method:'POST',body:{token:invited.path.split('/').at(-1),password:'local-test-password-only'}});
  await check('/api/invite',410,{method:'POST',body:{token:invited.path.split('/').at(-1),password:'local-test-password-only'}});
  await check('/flows',200,{user:2});
  for(const endpoint of ['/api/flows/navigation','/api/flows']) {
    const list=await (await check(endpoint,200,{user:2})).json();
    assert.deepEqual(list.map(p=>p.slug),[project]);checks++;
  }
  await check(`/api/flows/${project}/document`,200,{user:2});
  await check(`/api/flows/${other}/document`,403,{user:2});
  for(const endpoint of ['/api/access','/api/board','/api/history','/api/ai-ops/overview','/today','/personal']) await check(endpoint,403,{user:2});
  for(const endpoint of ['/flows/%70ersonal-ilchul','/api/flows/%70ersonal-ilchul/document','/api/notes/%70ersonal-ilchul']) await check(endpoint,403,{user:1});
  await check(`/api/flows/${project}/document`,403,{user:2,method:'PUT',body:{chart,revision:1}});
  await check(`/api/flows/${project}/document`,403,{user:3,method:'PUT',origin:'https://other.invalid',body:{chart,revision:1}});
  await check(`/api/flows/${project}/document`,200,{user:3,method:'PUT',body:{chart,revision:1}});
  await check(`/api/flows/${project}/materials/document`,403,{user:3,method:'DELETE'});
  await prisma.projectNote.createMany({data:[project,other].map(projectSlug=>({id:projectSlug,projectSlug,content:'note',priority:'normal',position:5,updatedAt:new Date()}))});
  await check(`/api/notes/item/${other}`,403,{user:3,method:'PATCH',body:{content:'cannot change'}});
  await check(`/api/notes/${project}/order`,204,{user:3,method:'PUT',body:{ids:[other,project]}});
  assert.equal((await prisma.projectNote.findUnique({where:{id:other}})).position,5);checks++;
  const html=await (await check(share.path,200)).text();
  assert.ok(html.includes('only this document'));assert.ok(!html.includes(other));checks+=2;
  await check(share.path,405,{method:'POST'});
  await prisma.accessShare.deleteMany({where:{projectSlug:project}});
  await check(share.path,404);
  await check('/api/logout',204,{user:2,method:'POST'});
  await check('/api/flows/navigation',401,{user:2});
  await prisma.accessUser.update({where:{id:users[3].id},data:{active:false}});
  await check(`/api/flows/${project}/document`,401,{user:3});
  // migration 전/저장소 장애에서도 페이지는 JSON 오류 대신 로그인으로 안내한다.
  assertTestDatabase(process.env.DATABASE_URL);
  await prisma.$executeRawUnsafe('ALTER TABLE access_user RENAME TO access_user_unavailable_test');
  accountTableRenamed=true;
  const unavailable=await check('/flows',307,{user:0});
  assert.equal(new URL(unavailable.headers.get('location'),base).pathname,'/login');checks++;
  const notice=await (await check('/login?error=auth-unavailable',200)).text();
  assert.ok(notice.includes('현재 로그인 서비스를 사용할 수 없습니다'));checks++;
  await check('/api/flows/navigation',503,{user:0});
  await prisma.$executeRawUnsafe('ALTER TABLE access_user_unavailable_test RENAME TO access_user');
  accountTableRenamed=false;
  console.log(`PASS: ${checks} HTTP 권한·SSR·공유·세션 검증 (로컬 테스트 DB)`);
} finally {
  if(child && child.exitCode===null) {child.kill('SIGTERM');await once(child,'exit');}
  if(accountTableRenamed) await prisma.$executeRawUnsafe('ALTER TABLE access_user_unavailable_test RENAME TO access_user');
  const invited=await prisma.accessUser.findUnique({where:{username:`${prefix}-invited`},select:{id:true}});
  await prisma.accessShare.deleteMany({where:{projectSlug:{in:[project,other]}}});
  await prisma.accessUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
  await prisma.accessUser.deleteMany({where:{username:`${prefix}-invited`}});
  await prisma.accessInvite.deleteMany({where:{username:`${prefix}-invited`}});
  await prisma.accessAudit.deleteMany({where:{actorId:{in:[...users.map(u=>u.id),...(invited?[invited.id]:[])]}}});
  await prisma.accessThrottle.deleteMany({where:{key:{in:[`login:${users[2].id}`,'login:bootstrap','login:global','invite:global'].map(tokenHash)}}});
  await prisma.projectNote.deleteMany({where:{id:{in:[project,other]}}});
  await prisma.flowDocument.deleteMany({where:{projectSlug:{in:[project,other]}}});
  await prisma.flowCategory.deleteMany({where:{projectSlug:{in:[project,other]}}});
  await prisma.flowProject.deleteMany({where:{slug:{in:[project,other]}}});
  await prisma.$disconnect();
}
