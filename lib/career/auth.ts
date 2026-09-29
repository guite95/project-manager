import {jwtVerify, type JWTVerifyGetKey, type JWTPayload} from 'jose';
import {fail} from './core.ts';
export const MCP_PATH='/mcp/career';
export const METADATA_PATH='/.well-known/oauth-protected-resource/mcp/career';
export const SCOPES=['career:read','career:evaluate','career:write'];
export type CareerConfig={resource:string;issuer:string;jwks:string;subject:string;ownerId:string;clientId:string;requireOwnerEpoch?:boolean};
export type CareerActor={ownerId:string;scopes:string[];oauthEpoch?:number;grantDeadline?:number};
export const isCareerRoute=(path:string,method:string)=>path===MCP_PATH&&['POST','GET','DELETE','HEAD'].includes(method)||path===METADATA_PATH&&['GET','HEAD'].includes(method);
export function careerConfig(env:NodeJS.ProcessEnv=process.env):CareerConfig|null {
  if(env.CAREER_MCP_ENABLED!=='true')return null;
  const resource=env.CAREER_MCP_RESOURCE,ownerId=env.CAREER_MCP_OWNER_ID,clientId=env.CAREER_MCP_CLIENT_ID;
  const local=env.CAREER_OAUTH_ENABLED==='true';
  const localIssuer=local&&resource?new URL(resource).origin+'/api/career-auth':undefined;
  const issuer=local?localIssuer:env.CAREER_MCP_ISSUER,jwks=local?localIssuer+'/jwks':env.CAREER_MCP_JWKS_URL,subject=local?ownerId:env.CAREER_MCP_SUBJECT;
  if(local&&[[env.CAREER_MCP_ISSUER,issuer],[env.CAREER_MCP_JWKS_URL,jwks],[env.CAREER_MCP_SUBJECT,subject]].some(([configured,expected])=>configured&&configured!==expected))return fail('MCP_NOT_CONFIGURED');
  if(!resource||!issuer||!jwks||!subject||!ownerId||!clientId)return fail('MCP_NOT_CONFIGURED');
  for(const value of [resource,issuer,jwks]){let url:URL;try{url=new URL(value);}catch{return fail('MCP_NOT_CONFIGURED');}if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)return fail('MCP_NOT_CONFIGURED');}
  if(new URL(resource).pathname!==MCP_PATH||new URL(jwks).origin!==new URL(issuer).origin)return fail('MCP_NOT_CONFIGURED');
  return {resource,issuer,jwks,subject,ownerId,clientId,...local?{requireOwnerEpoch:true}:{}};
}
export function verifyRequestOrigin(request:Request,config:CareerConfig) {
  const url=new URL(config.resource),origin=request.headers.get('origin');
  if(request.headers.get('host')!==url.host || origin!==null && ![url.origin,'https://chatgpt.com'].includes(origin))fail('MCP_ORIGIN_DENIED');
}
export async function authorizeCareer(request:Request,config:CareerConfig,keySet:JWTVerifyGetKey,lookupOwner:(id:string)=>Promise<{id:string;role:string;active:boolean;oauthEpoch?:number}|null>):Promise<CareerActor> {
  verifyRequestOrigin(request,config);
  const header=request.headers.get('authorization');
  if(!header || !/^Bearer [A-Za-z0-9_.-]{20,12000}$/.test(header))return fail('MCP_UNAUTHORIZED');
  let payload:JWTPayload;
  try {({payload}=await jwtVerify(header.slice(7),keySet,{issuer:config.issuer,audience:config.resource,algorithms:['RS256','ES256'],requiredClaims:['sub','exp','iat'],maxTokenAge:'1h',clockTolerance:5}));}
  catch{return fail('MCP_UNAUTHORIZED');}
  if(payload.sub!==config.subject||typeof payload.scope!=='string'||!payload.exp||!payload.iat||payload.exp-payload.iat>3600)return fail('MCP_UNAUTHORIZED');
  const clients=[payload.client_id,payload.azp].filter(v=>v!==undefined);
  if(!clients.length||clients.some(c=>c!==config.clientId))return fail('MCP_UNAUTHORIZED');
  const scopes=payload.scope.split(' ').filter(s=>SCOPES.includes(s));
  if(!scopes.includes('career:read'))return fail('MCP_SCOPE_REQUIRED');
  const owner=await lookupOwner(config.ownerId);
  if(!owner?.active||owner.role!=='OWNER'||owner.id!==config.ownerId)return fail('MCP_OWNER_REQUIRED');
  if(config.requireOwnerEpoch&&(!Number.isSafeInteger(payload.owner_epoch)||Number(payload.owner_epoch)<0||payload.owner_epoch!==owner.oauthEpoch||!Number.isSafeInteger(payload.grant_deadline)||Number(payload.grant_deadline)<=Date.now()/1000))return fail('MCP_UNAUTHORIZED');
  return {ownerId:owner.id,scopes,...config.requireOwnerEpoch?{oauthEpoch:Number(payload.owner_epoch),grantDeadline:Number(payload.grant_deadline)}:{}};
}
