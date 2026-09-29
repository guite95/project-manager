import {jwtVerify, type JWTVerifyGetKey, type JWTPayload} from 'jose';
import {fail} from './core.ts';
export const MCP_PATH='/mcp/career';
export const METADATA_PATH='/.well-known/oauth-protected-resource/mcp/career';
export const SCOPES=['career:read','career:evaluate','career:write'];
export type CareerConfig={resource:string;issuer:string;jwks:string;subject:string;ownerId:string;clientId:string};
export type CareerActor={ownerId:string;scopes:string[]};
export const isCareerRoute=(path:string,method:string)=>path===MCP_PATH&&['POST','GET','DELETE','HEAD'].includes(method)||path===METADATA_PATH&&['GET','HEAD'].includes(method);
export function careerConfig(env:NodeJS.ProcessEnv=process.env):CareerConfig|null {
  if(env.CAREER_MCP_ENABLED!=='true')return null;
  const resource=env.CAREER_MCP_RESOURCE,issuer=env.CAREER_MCP_ISSUER,jwks=env.CAREER_MCP_JWKS_URL,subject=env.CAREER_MCP_SUBJECT,ownerId=env.CAREER_MCP_OWNER_ID,clientId=env.CAREER_MCP_CLIENT_ID;
  if(!resource||!issuer||!jwks||!subject||!ownerId||!clientId)return fail('MCP_NOT_CONFIGURED');
  for(const value of [resource,issuer,jwks]){let url:URL;try{url=new URL(value);}catch{return fail('MCP_NOT_CONFIGURED');}if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)return fail('MCP_NOT_CONFIGURED');}
  if(new URL(resource).pathname!==MCP_PATH||new URL(jwks).origin!==new URL(issuer).origin)return fail('MCP_NOT_CONFIGURED');
  return {resource,issuer,jwks,subject,ownerId,clientId};
}
export function verifyRequestOrigin(request:Request,config:CareerConfig) {
  const url=new URL(config.resource),origin=request.headers.get('origin');
  if(request.headers.get('host')!==url.host || origin!==null && ![url.origin,'https://chatgpt.com'].includes(origin))fail('MCP_ORIGIN_DENIED');
}
export async function authorizeCareer(request:Request,config:CareerConfig,keySet:JWTVerifyGetKey,lookupOwner:(id:string)=>Promise<{id:string;role:string;active:boolean}|null>):Promise<CareerActor> {
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
  return {ownerId:owner.id,scopes};
}
