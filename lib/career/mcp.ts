import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {CareerError, auditText, inputSchema, fail, VERSIONS} from './core.ts';
import {rewriteSchema} from './rewrite.ts';
import {RUBRIC} from './rubric.ts';
import type {CareerActor} from './auth.ts';
import {saveSchema} from '../server/career-store.ts';

export type CareerServices={
  checkOwner:()=>Promise<unknown>;
  list:(kind:'EXPERIENCE'|'COVER_LETTER'|'PORTFOLIO',offset:number)=>Promise<unknown>;
  get:(id:string)=>Promise<unknown>;
  start:(input:unknown,requestId:string)=>Promise<unknown>;
  rewrite:(request:z.infer<typeof rewriteSchema>)=>Promise<unknown>;
  session:(id:string)=>Promise<unknown>;
  save:(id:string,input:z.infer<typeof saveSchema>)=>Promise<unknown>;
};
export function createCareerMcp(actor:CareerActor,services:CareerServices) {
  const server=new McpServer({name:'career-quality',version:'0.3.0'});
  function register<T extends z.ZodRawShape>(name:string,description:string,shape:T,scope:string,readOnly:boolean,openWorld:boolean,handler:(args:z.infer<z.ZodObject<T>>)=>Promise<unknown>) {
    const schema=z.strictObject(shape);
    server.registerTool<z.ZodRawShape,typeof schema>(name,{title:name,description,inputSchema:schema,annotations:{readOnlyHint:readOnly,destructiveHint:name==='career_save_draft',idempotentHint:readOnly||name==='career_evaluate'||name==='career_save_draft',openWorldHint:openWorld},_meta:{securitySchemes:[{type:'oauth2',scopes:scope==='career:read'?['career:read']:['career:read',scope]}]}},async args=>{
      try {
        if(!actor.scopes.includes(scope))fail('MCP_SCOPE_REQUIRED');await services.checkOwner();
        const data=await handler(args as z.infer<z.ZodObject<T>>);
        const structuredContent=data&&typeof data==='object'&&!Array.isArray(data)?data as Record<string,unknown>:{data};
        return {content:[{type:'text' as const,text:JSON.stringify(structuredContent)}],structuredContent};
      } catch(error) {
        const code=error instanceof CareerError?error.code:error instanceof z.ZodError?'INVALID_INPUT':'CAREER_SERVICE_UNAVAILABLE';
        return {isError:true,content:[{type:'text' as const,text:code}],...(code==='MCP_SCOPE_REQUIRED'?{_meta:{'mcp/www_authenticate':[`Bearer error="insufficient_scope", scope="career:read ${scope}"`]}}:{})};
      }
    });
  }
  register('career_contract','Read the exact evaluation input/rewrite schemas and scoring policy before using Jev. No external evaluation. Scores are writing quality, never AI authorship probabilities.',{},'career:read',true,false,async()=>({
    ...VERSIONS,inputSchema:z.toJSONSchema(inputSchema),rewriteSchema:z.toJSONSchema(rewriteSchema),rubric:RUBRIC,
    policy:{minimumConfidence:.7,reviewBand:[2.8,3.2],maximumRewriteCandidates:2,maximumProviderAttempts:12,wholeDraftRegressionRequired:true},
    limitations:['PROJECT_RECORD source import is not yet supported.','No automatic sentence-level Jev pass; ChatGPT may review sentences within returned failing paragraphs.','Oversized whole-context requests stop INCOMPLETE; no hidden truncation.','Scores are experimental, not hiring or AI-authorship probabilities.'],
    consent:'Before the first evaluation obtain consent to send the selected JD, experience evidence and draft to OpenRouter/TypeSafe and persist evaluation snapshots in the private PM database. Do not send credentials or full chat history.',
  }));
  register('career_audit','Count the exact submission text deterministically. Does not use Jev or execute Python.',{text:z.string().max(80000),newlines:z.enum(['PRESERVE','LF','REMOVE']).default('PRESERVE')},'career:read',true,false,async args=>auditText(args.text,args.newlines));
  register('career_list_documents','List private recruitment document summaries only. Never includes credentials or bodies.',{kind:z.enum(['EXPERIENCE','COVER_LETTER','PORTFOLIO']),offset:z.number().int().min(0).default(0)},'career:read',true,false,args=>services.list(args.kind,args.offset));
  register('career_get_document','Read exactly one user-selected recruitment document with revision and source text. A cover-letter draft is not evidence of experience.',{id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)},'career:read',true,false,args=>services.get(args.id));
  register('career_evaluate','Evaluate the complete draft, then failing paragraphs using Jev. Paid external call and private evaluation snapshot write. Obtain explicit external-evaluation consent. Read career_contract first. Reuse requestId when retrying an ambiguous call, never create a new ID to chase a score.',{input:z.record(z.string(),z.unknown()),requestId:z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),consentToExternalEvaluation:z.boolean()},'career:evaluate',false,true,args=>{
    if(args.consentToExternalEvaluation!==true)fail('EXTERNAL_CONSENT_REQUIRED');return services.start(args.input,args.requestId);
  });
  register('career_session','Resume by reading an existing evaluation session. RUNNING does not authorize resubmission. No provider call, no save.',{sessionId:z.string().regex(/^[a-f0-9]{64}$/)},'career:read',true,false,args=>services.session(args.sessionId));
  register('career_rewrite','Submit only the approved failing-span replacements from ChatGPT and re-evaluate the whole draft. Prior session consent is required. Preserves non-target text and compares regression; no document save.',{request:rewriteSchema},'career:evaluate',false,true,args=>services.rewrite(args.request));
  register('career_save_draft','Save the selected evaluated draft only after an explicit user request to save to Project Management. PASS is not consent. Requires exact evaluation/hash and document revision; conflicts never overwrite. Evaluation snapshots are separate from this document save.',{sessionId:z.string().regex(/^[a-f0-9]{64}$/),input:saveSchema},'career:write',false,false,args=>services.save(args.sessionId,args.input));
  return server;
}
