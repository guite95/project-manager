import {createHash,randomBytes} from 'node:crypto';
import {betterAuth} from 'better-auth';
import {prismaAdapter} from 'better-auth/adapters/prisma';
import {createAuthEndpoint,APIError} from 'better-auth/api';
import {setSessionCookie} from 'better-auth/cookies';
import {jwt} from 'better-auth/plugins';
import {oauthProvider} from '@better-auth/oauth-provider';
import type {AccessUser,Prisma} from '@prisma/client';
import {prisma} from '../db.ts';
import {tokenHash,throttle} from '../access/store.ts';
import {SESSION_COOKIE_NAME} from '../session.ts';
import {AUTH_PATH,OAUTH_SCOPES,findOAuthClient,oauthRouteKind,readOAuthConfig,validateOAuthQuery,type OAuthClient,type OAuthConfig} from '../career/oauth-policy.ts';
import {getRuntimeSecret} from './runtime-secrets.mjs';
import {lockOAuthOwner,revokeInTransaction} from './career-oauth-store.ts';

const flowCookie='__Host-career_oauth_flow';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const cookie=(request:Request,name:string)=>request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)??'';
function fail():never{throw new Error('OAUTH_REQUEST_DENIED');}
const setFlow=(response:Response,value:string)=>response.headers.append('Set-Cookie',`${flowCookie}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value?'300':'0'}`);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});

async function requireWebOwner(tx:Prisma.TransactionClient,request:Request,owner:AccessUser){
  const token=cookie(request,SESSION_COOKIE_NAME);
  if(!/^v2\.[A-Za-z0-9_-]{43}$/.test(token))return fail();
  const session=await tx.accessSession.findUnique({where:{tokenHash:tokenHash(token.slice(3))}});
  if(!session||session.userId!==owner.id||session.expiresAt<=new Date())fail();
}

export async function careerConnectionView(requestHeaders:Headers,stage:'login'|'consent'|'manage'){
  try{
    const config=readOAuthConfig(process.env,process.env.CAREER_OAUTH_ENABLED==='true'?getRuntimeSecret('CAREER_OAUTH_SECRET'):undefined);
    if(!config)return null;
    const request=new Request(config.origin,{headers:requestHeaders});
    const owner=await prisma.accessUser.findUnique({where:{id:config.ownerId}});
    if(!owner?.active||owner.role!=='OWNER')return null;
    let signedIn=false;
    try{await requireWebOwner(prisma,request,owner);signedIn=true;}catch{}
    if(stage==='manage')return signedIn?{signedIn,scopes:[] as string[],redirectUri:config.redirectUri,clientName:'취업 지원 도구'}:null;
    const token=cookie(request,flowCookie);
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const flow=await prisma.careerOAuthRequest.findUnique({where:{id:hash(token)}});
    if(!flow||flow.stage!==stage||flow.expiresAt<=new Date()||stage==='consent'&&(!signedIn||flow.ownerEpoch!==owner.oauthEpoch))return null;
    const query=validateOAuthQuery(new URLSearchParams(flow.query),config);
    const client=findOAuthClient(config,query.get('client_id'))!;
    return {signedIn,scopes:query.get('scope')!.split(' '),redirectUri:client.redirectUri,clientName:client.name};
  }catch{return null;}
}

// This handler is never mounted directly. The outer transaction and allowlist are mandatory.
function provider(tx:Prisma.TransactionClient,config:OAuthConfig,owner:AccessUser){
  return betterAuth({
    appName:'Private career tools',baseURL:config.origin,basePath:AUTH_PATH,secret:config.secret,
    database:prismaAdapter(tx,{provider:'postgresql',transaction:false}),
    logger:{disabled:true},rateLimit:{enabled:false},trustedOrigins:[config.origin],
    user:{modelName:'careerOAuthUser'},account:{modelName:'careerOAuthAccount'},verification:{modelName:'careerOAuthVerification'},
    session:{modelName:'careerOAuthSession',expiresIn:30*86400,disableSessionRefresh:true,cookieCache:{enabled:false},additionalFields:{ownerEpoch:{type:'number',required:true,input:false}}},
    advanced:{cookiePrefix:'career-oauth',useSecureCookies:true},
    plugins:[
      jwt({schema:{jwks:{modelName:'careerOAuthJwks'}},jwks:{keyPairConfig:{alg:'ES256'},rotationInterval:30*86400,gracePeriod:86400},jwt:{issuer:config.issuer,expirationTime:'15m'}}),
      oauthProvider({
        schema:{oauthClient:{modelName:'careerOAuthClient'},oauthResource:{modelName:'careerOAuthResource'},oauthClientResource:{modelName:'careerOAuthClientResource'},oauthRefreshToken:{modelName:'careerOAuthRefreshToken'},oauthAccessToken:{modelName:'careerOAuthAccessToken'},oauthConsent:{modelName:'careerOAuthConsent'},oauthClientAssertion:{modelName:'careerOAuthClientAssertion'}},
        loginPage:config.origin+'/career/connect',consentPage:config.origin+'/career/consent',scopes:OAUTH_SCOPES,
        resources:[],grantTypes:['authorization_code','refresh_token'],allowDynamicClientRegistration:false,allowUnauthenticatedClientRegistration:false,
        clientPrivileges:()=>false,resourcePrivileges:()=>false,accessTokenExpiresIn:900,refreshTokenExpiresIn:30*86400,refreshTokenReuseInterval:0,codeExpiresIn:120,
        extensions:[{claims:{accessToken:async({user,sessionId,resources})=>{
          const session=sessionId?await tx.careerOAuthSession.findUnique({where:{id:sessionId}}):null;
          if(user?.id!==owner.id||!session||session.userId!==owner.id||session.ownerEpoch!==owner.oauthEpoch||session.expiresAt<=new Date()||resources?.length!==1||resources[0]!==config.resource)throw new APIError('BAD_REQUEST',{error:'invalid_grant',error_description:'Authorization is no longer valid'});
          return {owner_epoch:session.ownerEpoch,grant_deadline:Math.floor(session.expiresAt.getTime()/1000)};
        }}}],
      }),
      {id:'existing-owner-bridge',endpoints:{ownerBridge:createAuthEndpoint('/owner-bridge',{method:'POST'},async ctx=>{
        // Only reachable after PM session, CSRF, pending flow and row-lock checks below.
        const user=await ctx.context.internalAdapter.findUserById(owner.id);
        if(!user)throw new APIError('UNAUTHORIZED');
        const session=await ctx.context.internalAdapter.createSession(owner.id,false,{ownerEpoch:owner.oauthEpoch});
        await setSessionCookie(ctx,{session,user});
        return ctx.json({ok:true});
      })}},
    ],
  });
}

async function provision(tx:Prisma.TransactionClient,config:OAuthConfig,owner:AccessUser,registered:OAuthClient){
  const now=new Date();
  await tx.careerOAuthUser.upsert({where:{id:owner.id},create:{id:owner.id,name:'Owner',email:`${hash(owner.id)}@owner.invalid`,emailVerified:false,createdAt:now,updatedAt:now},update:{}});
  const client={clientId:registered.clientId,name:registered.name,userId:owner.id,redirectUris:[registered.redirectUri],scopes:OAUTH_SCOPES,grantTypes:['authorization_code','refresh_token'],responseTypes:['code'],tokenEndpointAuthMethod:'none',requirePKCE:true,skipConsent:false,disabled:false,updatedAt:now};
  await tx.careerOAuthClient.upsert({where:{clientId:registered.clientId},create:{id:hash(registered.clientId),createdAt:now,...client},update:client});
  const resource={identifier:config.resource,name:'Private career MCP',accessTokenTtl:900,refreshTokenTtl:30*86400,signingAlgorithm:'ES256',allowedScopes:OAUTH_SCOPES,disabled:false,updatedAt:now};
  await tx.careerOAuthResource.upsert({where:{identifier:config.resource},create:{id:hash(config.resource),createdAt:now,...resource},update:resource});
  await tx.careerOAuthClientResource.upsert({where:{clientId_resourceId:{clientId:registered.clientId,resourceId:config.resource}},create:{id:hash(registered.clientId+' '+config.resource),clientId:registered.clientId,resourceId:config.resource,createdAt:now},update:{}});
}

async function boundedBody(request:Request){
  const reader=request.body?.getReader();if(!reader)return '';
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();fail();}chunks.push(value);}}
  finally{reader.releaseLock();}
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}

export async function careerOAuthHttp(request:Request):Promise<Response>{
  let config:OAuthConfig|null;
  try{config=readOAuthConfig(process.env,process.env.CAREER_OAUTH_ENABLED==='true'?getRuntimeSecret('CAREER_OAUTH_SECRET'):undefined);}catch{return json({error:'OAUTH_NOT_CONFIGURED'},503);}
  if(!config)return new Response(null,{status:404,headers});
  const url=new URL(request.url),kind=oauthRouteKind(url.pathname,request.method);
  if(!kind)return new Response(null,{status:404,headers});
  if(request.headers.get('host')!==new URL(config.origin).host)return json({error:'OAUTH_REQUEST_DENIED'},403);
  if(kind==='browser'&&request.headers.get('origin')!==config.origin)return json({error:'OAUTH_REQUEST_DENIED'},403);
  // Next standalone constructs Request.url from its internal listen address. Use only
  // the configured public origin after Host validation; never trust forwarded-host.
  request=new Request(new URL(url.pathname+url.search,config.origin),request);
  try{
    // Public metadata is read-only, including before the first connection.
    if(kind==='metadata'){
      if(url.pathname===AUTH_PATH+'/jwks'){
        const keys=await prisma.careerOAuthJwks.findMany({where:{OR:[{expiresAt:null},{expiresAt:{gt:new Date(Date.now()-86400_000)}}]}});
        return json({keys:keys.map(k=>({...JSON.parse(k.publicKey),kid:k.id,alg:k.alg??'ES256',use:'sig'}))});
      }
      return json({issuer:config.issuer,authorization_endpoint:config.issuer+'/oauth2/authorize',token_endpoint:config.issuer+'/oauth2/token',revocation_endpoint:config.issuer+'/oauth2/revoke',jwks_uri:config.issuer+'/jwks',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],revocation_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:OAUTH_SCOPES});
    }
    await throttle(`career:oauth:${kind}`,kind==='authorize'?60:600);
    const raw=request.method==='POST'?await boundedBody(request):'';
    let body:Record<string,unknown>={};
    if(kind==='browser'){
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json')fail();
      body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')fail();
    }
    if(kind==='server'){
      if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')fail();
      const form=new URLSearchParams(raw);
      const allowed=url.pathname.endsWith('/token')?['client_id','grant_type','code','code_verifier','redirect_uri','resource','refresh_token','scope']:['client_id','token','token_type_hint'];
      const client=findOAuthClient(config,form.get('client_id'));
      if(!client||[...form.keys()].some(k=>!allowed.includes(k)||form.getAll(k).length!==1))fail();
      if(url.pathname.endsWith('/token')){
        if(!['authorization_code','refresh_token'].includes(form.get('grant_type')??'')||form.get('resource')!==config.resource)fail();
        if((form.get('grant_type')==='authorization_code'||form.has('redirect_uri'))&&form.get('redirect_uri')!==client.redirectUri)fail();
        if(form.has('scope')&&form.get('scope')!.split(' ').some(s=>!OAUTH_SCOPES.includes(s)))fail();
      }
    }
    const fixed=config;
    const response=await prisma.$transaction(async tx=>{
      const owner=await lockOAuthOwner(tx,fixed.ownerId);
      if(kind==='browser')await requireWebOwner(tx,request,owner);
      if(url.pathname===AUTH_PATH+'/disconnect'){
        if(Object.keys(body).length)fail();await revokeInTransaction(tx,owner.id);return json({disconnected:true});
      }
      const flowToken=cookie(request,flowCookie);
      const flow=/^[A-Za-z0-9_-]{43}$/.test(flowToken)?await tx.careerOAuthRequest.findUnique({where:{id:hash(flowToken)}}):null;
      const validFlow=flow&&flow.expiresAt>new Date();
      if(kind==='authorize'){
        validateOAuthQuery(url.searchParams,fixed);
        if(!validFlow||flow.stage!=='ready'||flow.query!==url.searchParams.toString()){
          const nonce=randomBytes(32).toString('base64url');
          await tx.careerOAuthRequest.deleteMany({where:{expiresAt:{lt:new Date()}}});
          await tx.careerOAuthRequest.create({data:{id:hash(nonce),query:url.searchParams.toString(),stage:'login',expiresAt:new Date(Date.now()+300_000)}});
          const redirect=new Response(null,{status:302,headers:{...headers,Location:fixed.origin+'/career/connect'}});setFlow(redirect,nonce);return redirect;
        }
        await requireWebOwner(tx,request,owner);
        if(flow.ownerEpoch!==owner.oauthEpoch)fail();
      }
      if(url.pathname===AUTH_PATH+'/owner-bridge'){
        if(Object.keys(body).length||!validFlow||flow.stage!=='login')fail();
        const query=validateOAuthQuery(new URLSearchParams(flow.query),fixed);
        await provision(tx,fixed,owner,findOAuthClient(fixed,query.get('client_id'))!);
        const auth=provider(tx,fixed,owner);
        const bridge=await auth.handler(new Request(request.url,{method:'POST',headers:request.headers,body:'{}'}));
        if(!bridge.ok)throw new Error('OAUTH_BRIDGE_FAILED');
        await tx.careerOAuthRequest.update({where:{id:flow.id},data:{stage:'ready',ownerEpoch:owner.oauthEpoch}});
        const result=json({redirect_uri:fixed.issuer+'/oauth2/authorize?'+flow.query});
        for(const c of bridge.headers.getSetCookie())result.headers.append('Set-Cookie',c);
        return result;
      }
      if(url.pathname===AUTH_PATH+'/oauth2/consent'){
        if(!validFlow||flow.stage!=='consent'||flow.ownerEpoch!==owner.oauthEpoch||typeof body.oauth_query!=='string'||hash(body.oauth_query)!==flow.consentHash||typeof body.accept!=='boolean'||Object.keys(body).some(k=>!['accept','oauth_query'].includes(k)))fail();
        validateOAuthQuery(new URLSearchParams(flow.query),fixed);
        // Single-use, browser-bound context; Better Auth additionally validates its query signature.
        await tx.careerOAuthRequest.delete({where:{id:flow.id}});
      }
      const auth=provider(tx,fixed,owner);
      const providerHeaders=new Headers(request.headers);
      // Token/revocation endpoints authenticate grants, never PM or browser sessions.
      if(kind==='server')providerHeaders.delete('cookie');
      const outgoing=await auth.handler(new Request(request.url,{method:request.method,headers:providerHeaders,...request.method==='POST'?{body:raw}:{}}));
      // Complete any body work while the provider's database transaction is still alive.
      const result=new Response(await outgoing.arrayBuffer(),{status:outgoing.status,headers:outgoing.headers});
      if(kind==='authorize'&&validFlow){
        const location=result.headers.get('location');
        if(location&&new URL(location,fixed.origin).pathname==='/career/consent'){
          await tx.careerOAuthRequest.update({where:{id:flow.id},data:{stage:'consent',consentHash:hash(new URL(location,fixed.origin).search.slice(1))}});
        }else{await tx.careerOAuthRequest.delete({where:{id:flow.id}});setFlow(result,'');}
      }
      if(url.pathname.endsWith('/consent'))setFlow(result,'');
      return result;
    },{maxWait:5000,timeout:15000});
    for(const [key,value]of Object.entries(headers))response.headers.set(key,value);
    response.headers.delete('set-auth-jwt');
    return response;
  }catch{return json({error:'OAUTH_REQUEST_DENIED'},400);}
}
