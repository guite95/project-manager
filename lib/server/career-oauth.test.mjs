import assert from 'node:assert/strict';
import {test,after,beforeEach} from 'node:test';
import {prisma} from './test-db.mjs';
import {assertCareerOAuthEpoch,revokeCareerOAuth} from './career-oauth-store.ts';
import {createHash} from 'node:crypto';
import {createLocalJWKSet,jwtVerify} from 'jose';
import {issueSession} from '../access/store.ts';
import {careerOAuthHttp,careerConnectionView} from './career-oauth.ts';
import {authorizeCareer,careerConfig} from '../career/auth.ts';
import {careerAuthorization} from '../career/authorization-context.ts';
import {requireCareerOwner} from './career-store.ts';
const ownerId='career-oauth-test-owner';
const origin='https://career-oauth.test';
const config={CAREER_OAUTH_ENABLED:'true',CAREER_OAUTH_SECRET:'test-only-oauth-secret-32-bytes-long-abcdef',CAREER_MCP_RESOURCE:origin+'/mcp/career',CAREER_MCP_OWNER_ID:ownerId,CAREER_MCP_CLIENT_ID:'chatgpt-test',CAREER_OAUTH_REDIRECT_URI:'https://chatgpt.com/connector/oauth/test'};
const previous=Object.fromEntries(Object.keys(config).map(k=>[k,process.env[k]]));
beforeEach(async()=>{
  Object.assign(process.env,config);
  await prisma.careerOAuthRequest.deleteMany();
  await prisma.accessThrottle.deleteMany();
  await prisma.accessUser.deleteMany({where:{id:ownerId}});
  await prisma.accessUser.create({data:{id:ownerId,username:ownerId,name:'Synthetic Owner',passwordHash:'test-only-hash',role:'OWNER'}});
});
after(async()=>{await prisma.accessUser.deleteMany({where:{id:ownerId}});await prisma.careerOAuthRequest.deleteMany();for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await prisma.$disconnect();});
test('DB trigger invalidates grants on password, role and active changes, not name edits',async()=>{
  await assertCareerOAuthEpoch(ownerId,0);
  await prisma.accessUser.update({where:{id:ownerId},data:{name:'Changed'}});
  await assertCareerOAuthEpoch(ownerId,0);
  for(const data of [{passwordHash:'changed-test-hash'},{role:'ADMIN'},{role:'OWNER'},{active:false},{active:true}]){
    const before=await prisma.accessUser.findUnique({where:{id:ownerId}});
    await prisma.accessUser.update({where:{id:ownerId},data});
    assert.equal((await prisma.accessUser.findUnique({where:{id:ownerId}})).oauthEpoch,before.oauthEpoch+1);
    await assert.rejects(()=>assertCareerOAuthEpoch(ownerId,before.oauthEpoch));
  }
});

function browser(){
  const cookies=new Map();
  return {cookies,async request(path,{method='GET',body,originHeader=true}={}){
    const headers=new Headers({host:new URL(origin).host,accept:'text/html',cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')});
    if(method==='POST'&&originHeader)headers.set('origin',origin);
    if(body)headers.set('content-type',body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json');
    const response=await careerOAuthHttp(new Request(new URL(path,origin),{method,headers,body:body instanceof URLSearchParams?body.toString():body?JSON.stringify(body):undefined}));
    for(const entry of response.headers.getSetCookie()){const pair=entry.split(';')[0];const index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1));}
    return response;
  }};
}
const verifier='test-verifier-'.repeat(5);
function authQuery(){return new URLSearchParams({client_id:config.CAREER_MCP_CLIENT_ID,redirect_uri:config.CAREER_OAUTH_REDIRECT_URI,response_type:'code',resource:config.CAREER_MCP_RESOURCE,scope:'career:read career:evaluate offline_access',state:'test-state',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});}
async function authorize(b=browser()){
  b.cookies.set('pm_session',await issueSession(ownerId));
  let r=await b.request('/api/career-auth/oauth2/authorize?'+authQuery());assert.equal(r.status,302);
  assert.equal(new URL(r.headers.get('location')).pathname,'/career/connect');
  r=await b.request('/api/career-auth/owner-bridge',{method:'POST',body:{}});assert.equal(r.status,200,await r.clone().text());
  r=await b.request((await r.json()).redirect_uri);assert.equal(r.status,302,await r.clone().text());
  const consent=new URL(r.headers.get('location'));
  if(consent.pathname===new URL(config.CAREER_OAUTH_REDIRECT_URI).pathname){assert.equal(consent.searchParams.get('state'),'test-state');assert.ok(consent.searchParams.get('code'));return {b,code:consent.searchParams.get('code')};}
  assert.equal(consent.pathname,'/career/consent');
  r=await b.request('/api/career-auth/oauth2/consent',{method:'POST',body:{accept:true,oauth_query:consent.search.slice(1)}});assert.equal(r.status,200,await r.clone().text());
  const consentResult=await r.json();assert.ok(consentResult.url);
  const callback=new URL(consentResult.url);assert.equal(callback.searchParams.get('state'),'test-state');
  return {b,code:callback.searchParams.get('code')};
}
async function exchange(b,values){return b.request('/api/career-auth/oauth2/token',{method:'POST',originHeader:false,body:new URLSearchParams({client_id:config.CAREER_MCP_CLIENT_ID,resource:config.CAREER_MCP_RESOURCE,...values})});}
async function issueTokens(){const {b,code}=await authorize();const values={grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:config.CAREER_OAUTH_REDIRECT_URI};const r=await exchange(b,values);assert.equal(r.status,200);return {b,values,tokens:await r.json()};}
test('real Better Auth authorization, PKCE exchange, signed JWT and refresh survive ordinary web logout but not disconnect',async()=>{
  const {b,code}=await authorize();
  const values={grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:config.CAREER_OAUTH_REDIRECT_URI};
  let r=await exchange(b,values);assert.equal(r.status,200,await r.clone().text());const tokens=await r.json();assert.ok(tokens.refresh_token);
  const jwks=await (await b.request('/api/career-auth/jwks')).json();
  const {payload}=await jwtVerify(tokens.access_token,createLocalJWKSet(jwks),{issuer:origin+'/api/career-auth',audience:config.CAREER_MCP_RESOURCE,algorithms:['ES256']});
  assert.equal(payload.sub,ownerId);assert.equal(payload.owner_epoch,0);assert.ok(payload.exp-payload.iat<=900);
  const key=await prisma.careerOAuthJwks.findFirst();assert.ok(key);assert.equal(typeof JSON.parse(key.privateKey),'string');
  const localConfig=careerConfig({...config,CAREER_MCP_ENABLED:'true'});
  const verifyMcp=()=>authorizeCareer(new Request(config.CAREER_MCP_RESOURCE,{headers:{host:new URL(origin).host,authorization:`Bearer ${tokens.access_token}`}}),localConfig,createLocalJWKSet(jwks),id=>prisma.accessUser.findUnique({where:{id}}));
  assert.equal((await verifyMcp()).ownerId,ownerId);
  await prisma.accessSession.deleteMany({where:{userId:ownerId}});b.cookies.delete('pm_session');
  r=await exchange(b,{grant_type:'refresh_token',refresh_token:tokens.refresh_token});assert.equal(r.status,200,await r.clone().text());const refreshed=await r.json();
  assert.notEqual(refreshed.refresh_token,tokens.refresh_token);
  await revokeCareerOAuth(ownerId);
  assert.notEqual((await exchange(b,{grant_type:'refresh_token',refresh_token:refreshed.refresh_token})).status,200);
  await assert.rejects(()=>assertCareerOAuthEpoch(ownerId,payload.owner_epoch));
  await assert.rejects(verifyMcp);
});

test('metadata and JWKS reads do not seed identity, clients, resources, grants or signing keys',async()=>{
  const models=['careerOAuthUser','careerOAuthClient','careerOAuthResource','careerOAuthConsent','careerOAuthSession','careerOAuthJwks'];
  const before=await Promise.all(models.map(m=>prisma[m].count()));
  for(const path of ['/api/career-auth/jwks','/.well-known/oauth-authorization-server/api/career-auth']){const r=await browser().request(path);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');}
  assert.deepEqual(await Promise.all(models.map(m=>prisma[m].count())),before);
});
test('standalone Next internal request URL is canonicalized only after checking the external Host',async()=>{
  const url='http://0.0.0.0:30001/.well-known/oauth-authorization-server/api/career-auth';
  const response=await careerOAuthHttp(new Request(url,{headers:{host:new URL(origin).host,'x-forwarded-host':'evil.test','x-forwarded-proto':'https'}}));
  assert.equal(response.status,200);assert.equal((await response.json()).issuer,origin+'/api/career-auth');
  assert.equal((await careerOAuthHttp(new Request(url,{headers:{host:'evil.test','x-forwarded-host':new URL(origin).host}}))).status,403);
});
test('disabled and incomplete configurations fail closed and unsupported provider routes remain closed',async()=>{
  process.env.CAREER_OAUTH_ENABLED='false';assert.equal((await browser().request('/api/career-auth/jwks')).status,404);
  process.env.CAREER_OAUTH_ENABLED='true';delete process.env.CAREER_OAUTH_SECRET;assert.equal((await browser().request('/api/career-auth/jwks')).status,503);
  Object.assign(process.env,config);
  for(const path of ['sign-up/email','sign-in/email','get-session','oauth2/register','admin/oauth2/create-client','oauth2/continue','token'])assert.equal((await browser().request('/api/career-auth/'+path,{method:'POST',body:{}})).status,404);
});
test('bridge requires same-origin current OWNER login and a browser-bound one-time pending request',async()=>{
  const b=browser();await b.request('/api/career-auth/oauth2/authorize?'+authQuery());
  assert.equal((await b.request('/api/career-auth/owner-bridge',{method:'POST',body:{}})).status,400);
  b.cookies.set('pm_session',await issueSession(ownerId));
  assert.equal((await b.request('/api/career-auth/owner-bridge',{method:'POST',originHeader:false,body:{}})).status,403);
  const other=browser();other.cookies.set('pm_session',b.cookies.get('pm_session'));
  assert.equal((await other.request('/api/career-auth/owner-bridge',{method:'POST',body:{}})).status,400);
  let r=await b.request('/api/career-auth/owner-bridge',{method:'POST',body:{}});assert.equal(r.status,200);
  assert.equal((await b.request('/api/career-auth/owner-bridge',{method:'POST',body:{}})).status,400);
  const next=(await r.json()).redirect_uri;
  await prisma.accessSession.deleteMany({where:{userId:ownerId}});
  assert.equal((await b.request(next)).status,400,'BA cookie alone cannot authorize after PM logout');
});
test('consent is bound to exact query, current PM session, epoch and one-time browser context',async()=>{
  const b=browser();b.cookies.set('pm_session',await issueSession(ownerId));
  await b.request('/api/career-auth/oauth2/authorize?'+authQuery());
  let r=await b.request('/api/career-auth/owner-bridge',{method:'POST',body:{}});
  r=await b.request((await r.json()).redirect_uri);
  const query=new URL(r.headers.get('location')).search.slice(1);
  assert.equal((await b.request('/api/career-auth/oauth2/consent',{method:'POST',body:{accept:true,oauth_query:query+'&scope=career:write'}})).status,400);
  assert.equal((await b.request('/api/career-auth/oauth2/consent',{method:'POST',body:{accept:true,oauth_query:query,scope:'career:write'}})).status,400);
  const saved=b.cookies.get('pm_session');b.cookies.delete('pm_session');
  assert.equal((await b.request('/api/career-auth/oauth2/consent',{method:'POST',body:{accept:true,oauth_query:query}})).status,400);b.cookies.set('pm_session',saved);
  const denied=await b.request('/api/career-auth/oauth2/consent',{method:'POST',body:{accept:false,oauth_query:query}});assert.equal(denied.status,200);
  const deniedBody=await denied.json();assert.equal(new URL(deniedBody.url??deniedBody.redirect_uri).searchParams.get('error'),'access_denied');
  assert.equal((await b.request('/api/career-auth/oauth2/consent',{method:'POST',body:{accept:true,oauth_query:query}})).status,400);
});
test('invalid PKCE and reused authorization code cannot issue tokens',async()=>{
  const {b,code}=await authorize();
  const values={grant_type:'authorization_code',code,redirect_uri:config.CAREER_OAUTH_REDIRECT_URI,code_verifier:'wrong-verifier-'.repeat(5)};
  assert.notEqual((await exchange(b,values)).status,200);
  // The provider consumes failed codes, so do not rely on retry after an invalid verifier.
  const fresh=await issueTokens();assert.notEqual((await exchange(fresh.b,fresh.values)).status,200);
});
test('refresh replay is rejected and a grant never extends past its original session deadline',async()=>{
  const {b,tokens}=await issueTokens();
  let r=await exchange(b,{grant_type:'refresh_token',refresh_token:tokens.refresh_token});assert.equal(r.status,200);const rotated=await r.json();
  assert.notEqual((await exchange(b,{grant_type:'refresh_token',refresh_token:tokens.refresh_token})).status,200);
  assert.notEqual((await exchange(b,{grant_type:'refresh_token',refresh_token:rotated.refresh_token})).status,200,'reuse revokes the token family');
  // A new consent is a new grant. Expiring that grant must also reject fresh refresh tokens.
  const fresh=await issueTokens();await prisma.careerOAuthSession.updateMany({where:{userId:ownerId},data:{expiresAt:new Date(0)}});
  assert.notEqual((await exchange(fresh.b,{grant_type:'refresh_token',refresh_token:fresh.tokens.refresh_token})).status,200);
});
test('refresh cannot expand consent and attenuation removes evaluation capability',async()=>{
  const {b,tokens}=await issueTokens();
  assert.notEqual((await exchange(b,{grant_type:'refresh_token',refresh_token:tokens.refresh_token,scope:'career:read career:write offline_access'})).status,200);
  const r=await exchange(b,{grant_type:'refresh_token',refresh_token:tokens.refresh_token,scope:'career:read offline_access'});assert.equal(r.status,200);
  const narrowed=await r.json(),jwks=await (await b.request('/api/career-auth/jwks')).json();
  const {payload}=await jwtVerify(narrowed.access_token,createLocalJWKSet(jwks));assert.equal(payload.scope,'career:read offline_access');
});
test('standard revoke rejects future refresh while OWNER disconnect also invalidates issued access tokens',async()=>{
  const {b,tokens}=await issueTokens();
  const revoke=await b.request('/api/career-auth/oauth2/revoke',{method:'POST',originHeader:false,body:new URLSearchParams({client_id:config.CAREER_MCP_CLIENT_ID,token:tokens.refresh_token,token_type_hint:'refresh_token'})});assert.equal(revoke.status,200);
  assert.notEqual((await exchange(b,{grant_type:'refresh_token',refresh_token:tokens.refresh_token})).status,200);
  const r=await b.request('/api/career-auth/disconnect',{method:'POST',body:{}});assert.equal(r.status,200);
  await assert.rejects(()=>assertCareerOAuthEpoch(ownerId,0));
});
test('inactive or nonOWNER account and expired pending flow cannot bridge a browser session',async()=>{
  const b=browser();b.cookies.set('pm_session',await issueSession(ownerId));await b.request('/api/career-auth/oauth2/authorize?'+authQuery());
  for(const data of [{role:'ADMIN'},{role:'MEMBER'},{role:'OWNER',active:false}]){
    await prisma.accessUser.update({where:{id:ownerId},data});
    assert.equal((await b.request('/api/career-auth/owner-bridge',{method:'POST',body:{}})).status,400);
  }
  await prisma.accessUser.update({where:{id:ownerId},data:{active:true}});
  await prisma.careerOAuthRequest.updateMany({data:{expiresAt:new Date(0)}});
  assert.equal((await b.request('/api/career-auth/owner-bridge',{method:'POST',body:{}})).status,400);
});
test('password change and concurrent disconnect cannot resurrect refresh grants',async()=>{
  const {b,tokens}=await issueTokens();
  const [response]=await Promise.all([exchange(b,{grant_type:'refresh_token',refresh_token:tokens.refresh_token}),revokeCareerOAuth(ownerId)]);
  if(response.ok){const refreshed=await response.json();assert.notEqual((await exchange(b,{grant_type:'refresh_token',refresh_token:refreshed.refresh_token})).status,200);}
  else assert.notEqual(response.status,200);
  const fresh=await issueTokens();await prisma.accessUser.update({where:{id:ownerId},data:{passwordHash:'new-synthetic-hash'}});
  assert.notEqual((await exchange(fresh.b,{grant_type:'refresh_token',refresh_token:fresh.tokens.refresh_token})).status,200);
});
test('connection view is read-only and public inputs cannot override configured host, callback or resource',async()=>{
  const b=browser();await b.request('/api/career-auth/oauth2/authorize?'+authQuery());
  const view=await careerConnectionView(new Headers({cookie:[...b.cookies].map(([k,v])=>`${k}=${v}`).join('; ')}),'login');
  assert.equal(view.signedIn,false);assert.ok(view.scopes.includes('career:evaluate'));
  const request=new Request(origin+'/api/career-auth/jwks',{headers:{host:'evil.test'}});assert.equal((await careerOAuthHttp(request)).status,403);
  for(const [k,v]of [['client_id','evil'],['redirect_uri','https://evil.test'],['resource','https://evil.test'],['scope','career:read admin']]){
    const q=authQuery();q.set(k,v);assert.equal((await b.request('/api/career-auth/oauth2/authorize?'+q)).status,400);
  }
});
test('disconnect invalidates old epochs without changing PM credentials or session data',async()=>{
  const before=await prisma.accessUser.findUnique({where:{id:ownerId}});
  await revokeCareerOAuth(ownerId);
  await assert.rejects(()=>assertCareerOAuthEpoch(ownerId,0));
  await assertCareerOAuthEpoch(ownerId,1);
  assert.equal((await prisma.accessUser.findUnique({where:{id:ownerId}})).passwordHash,before.passwordHash);
});
test('in-flight MCP tools recheck epoch before subsequent Jev calls and inside save transactions',async()=>{
  const actor={ownerId,scopes:['career:read'],oauthEpoch:0,grantDeadline:Math.floor(Date.now()/1000)+300};
  await careerAuthorization.run(actor,async()=>{
    await requireCareerOwner(ownerId);
    await revokeCareerOAuth(ownerId);
    await assert.rejects(()=>requireCareerOwner(ownerId));
    await assert.rejects(()=>prisma.$transaction(tx=>requireCareerOwner(ownerId,tx)));
  });
  await careerAuthorization.run({...actor,oauthEpoch:1,grantDeadline:1},async()=>{await assert.rejects(()=>requireCareerOwner(ownerId));});
});
