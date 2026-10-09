import {createRemoteJWKSet} from 'jose';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {CareerError, fail, hash} from '../career/core.ts';
import {careerConfig, authorizeCareer, METADATA_PATH, SCOPES, verifyRequestOrigin} from '../career/auth.ts';
import {createCareerMcp, type CareerServices, type CareerApplicationServices} from '../career/mcp.ts';
import {createJevProvider} from '../career/jev.ts';
import {prisma} from '../db.ts';
import {getRuntimeSecret} from './runtime-secrets.mjs';
import {listRecruitmentDocuments,getRecruitmentDocument} from './recruitment-store.ts';
import {recruitmentText} from '../recruitment.ts';
import {getCareerSession,requireCareerOwner,startCareerEvaluation,rewriteCareerEvaluation,saveCareerDraft} from './career-store.ts';
import {throttle} from '../access/store.ts';
import {assertCareerOAuthEpoch} from './career-oauth-store.ts';
import {careerAuthorization} from '../career/authorization-context.ts';
import {listApplications,getApplication,saveApplication,listApplicationTasks,saveApplicationTask,listApplicationHistory,restoreApplication,saveApplicationDraft} from './recruitment-applications-store.ts';
import {listRecruitmentJobs,getRecruitmentJob} from './recruitment-jobs-store.ts';

const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const keySets=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export function careerMetadata(request:Request) {
  try {
    const config=careerConfig();if(!config)return new Response(null,{status:404,headers:privateHeaders});
    verifyRequestOrigin(request,config);
    return Response.json({resource:config.resource,authorization_servers:[config.issuer],scopes_supported:SCOPES,bearer_methods_supported:['header'],resource_name:'Private career quality tools'},{headers:privateHeaders});
  } catch {return Response.json({error:'MCP_NOT_CONFIGURED'},{status:503,headers:privateHeaders});}
}
export async function careerHttp(request:Request):Promise<Response> {
  let config;
  try {config=careerConfig();}catch{return Response.json({error:'MCP_NOT_CONFIGURED'},{status:503,headers:privateHeaders});}
  if(!config)return new Response(null,{status:404,headers:privateHeaders});
  try {
    let jwks=keySets.get(config.jwks);if(!jwks){jwks=createRemoteJWKSet(new URL(config.jwks),{timeoutDuration:5000});keySets.set(config.jwks,jwks);}
    const actor=await authorizeCareer(request,config,jwks,id=>prisma.accessUser.findUnique({where:{id},select:{id:true,active:true,role:true,oauthEpoch:true}}));
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...privateHeaders,Allow:'POST'}});
    await throttle(`career:mcp:${actor.ownerId}`,300);
    const provider=()=>createJevProvider(getRuntimeSecret('OPENROUTER_API_KEY')??'');
    const services:CareerServices={
      checkOwner:async()=>{await requireCareerOwner(actor.ownerId);if(actor.oauthEpoch!==undefined)await assertCareerOAuthEpoch(actor.ownerId,actor.oauthEpoch);},
      list:async(kind,offset)=>{const all=await listRecruitmentDocuments(kind);return {documents:all.slice(offset,offset+50),nextOffset:offset+50<all.length?offset+50:null};},
      get:async id=>{const doc=await getRecruitmentDocument(id);if(!doc) return fail('DOCUMENT_NOT_FOUND');return {document:doc,source:{id:`source-${hash([id,doc.revision]).slice(7,31)}`,origin:'RECRUITMENT_DOCUMENT',title:doc.title,text:recruitmentText(doc),documentId:doc.id,revision:doc.revision,url:null,verification:'SOURCE_READ'}};},
      start:async(input,requestId)=>{await throttle(`career:evaluate:${actor.ownerId}`,20);return startCareerEvaluation(actor.ownerId,input,requestId,provider());},
      rewrite:request=>rewriteCareerEvaluation(actor.ownerId,request,provider()),
      session:id=>getCareerSession(actor.ownerId,id),save:(id,input)=>saveCareerDraft(actor.ownerId,id,input),
    };
    const applications:CareerApplicationServices={
      listApplications:query=>listApplications(actor.ownerId,query),
      getApplication:id=>getApplication(actor.ownerId,id),
      saveApplication:(id,application,expectedRevision,requestId)=>saveApplication(actor.ownerId,id,application,expectedRevision,requestId),
      listApplicationTasks:applicationId=>listApplicationTasks(actor.ownerId,applicationId),
      saveApplicationTask:(id,task,expectedRevision,requestId)=>saveApplicationTask(actor.ownerId,id,task,expectedRevision,requestId),
      listApplicationHistory:id=>listApplicationHistory(actor.ownerId,id),
      restoreApplication:(id,revision,expectedRevision,requestId)=>restoreApplication(actor.ownerId,id,revision,expectedRevision,requestId),
      saveApplicationDraft:(id,input)=>saveApplicationDraft(actor.ownerId,id,input),
      listJobs:listRecruitmentJobs,getJob:getRecruitmentJob,
    };
    const server=createCareerMcp(actor,services,applications);
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:350000});
    try {await server.connect(transport);const response=await careerAuthorization.run(actor,()=>transport.handleRequest(request));for(const [key,value]of Object.entries(privateHeaders))response.headers.set(key,value);return response;}
    finally {await server.close();}
  } catch(error) {
    const code=error instanceof CareerError?error.code:'CAREER_SERVICE_UNAVAILABLE';
    const unauthorized=['MCP_UNAUTHORIZED','MCP_SCOPE_REQUIRED','MCP_OWNER_REQUIRED'].includes(code);
    const metadata=new URL(METADATA_PATH,config.resource).href;
    return Response.json({error:code},{status:unauthorized?401:code==='MCP_ORIGIN_DENIED'?403:503,headers:{...privateHeaders,...(unauthorized?{'WWW-Authenticate':`Bearer resource_metadata="${metadata}", scope="career:read"`}:{})}});
  }
}
