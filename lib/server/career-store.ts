import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../db.ts';
import {fail, hash, parseInput, type EvaluationInput} from '../career/core.ts';
import {evaluate, type EvaluationResult} from '../career/evaluator.ts';
import {applyRewrite, compareCandidate, rewriteSchema} from '../career/rewrite.ts';
import type {DecisionProvider} from '../career/jev.ts';
import {parseRecruitmentDocument, recruitmentKey, recruitmentText, type RecruitmentDocument} from '../recruitment.ts';

type Entry={input:EvaluationInput;result:EvaluationResult;accepted:boolean};
export type CareerSession={id:string;ownerId:string;revision:number;requestHash:string;state:'RUNNING'|'COMPLETE';providerAttempts:number;history:Entry[];selectedVersion:number;pending:EvaluationInput|null;progress:EvaluationResult|null;startedAt:string;updatedAt:string;saved:{requestHash:string;documentId:string;revision:number}|null};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const key=(id:string)=>{if(!/^[a-f0-9]{64}$/.test(id))return fail('INVALID_SESSION_ID');return `career:session:${id}`;};
export async function requireCareerOwner(ownerId:string,db:Prisma.TransactionClient=prisma) {
  const owner=await db.accessUser.findUnique({where:{id:ownerId},select:{id:true,active:true,role:true}});
  if(!owner?.active||owner.role!=='OWNER')return fail('MCP_OWNER_REQUIRED');
  return owner;
}
export async function getCareerSession(ownerId:string,id:string):Promise<CareerSession> {
  await requireCareerOwner(ownerId);
  const row=await prisma.appSetting.findUnique({where:{key:key(id)}}),session=row?.value as unknown as CareerSession|undefined;
  if(!session||session.ownerId!==ownerId)return fail('SESSION_NOT_FOUND');
  // RUNNING is intentionally not retried: after a crash a provider request may already have been charged.
  return session;
}
async function replaceSession(previous:CareerSession,next:CareerSession):Promise<CareerSession> {
  const updated={...next,revision:previous.revision+1,updatedAt:new Date().toISOString()};
  const result=await prisma.appSetting.updateMany({where:{key:key(previous.id),value:{equals:json(previous)}},data:{value:json(updated)}});
  if(result.count!==1)return fail('SESSION_CONFLICT');return updated;
}
async function validateSources(input:EvaluationInput) {
  for(const source of input.sources) {
    if(source.origin==='PROJECT_RECORD')fail('PROJECT_RECORD_IMPORT_NOT_SUPPORTED');
    if(source.origin==='RECRUITMENT_DOCUMENT') {
      if(!source.documentId||source.revision===null||source.verification!=='SOURCE_READ')fail('SOURCE_REVISION_REQUIRED');
      const row=await prisma.appSetting.findUnique({where:{key:recruitmentKey(source.documentId)}});
      const document=row?.value as unknown as RecruitmentDocument|undefined;
      if(!document||document.revision!==source.revision||recruitmentText(document)!==source.text)fail('SOURCE_CHANGED');
      if(document.kind==='COVER_LETTER' && input.facts.some(f=>f.sourceRefs.some(r=>r.sourceId===source.id)))fail('DRAFT_IS_NOT_EVIDENCE');
    } else if(source.verification==='SOURCE_READ')fail('UNVERIFIED_SOURCE_ORIGIN');
  }
  if(input.baseDocument) {
    const row=await prisma.appSetting.findUnique({where:{key:recruitmentKey(input.baseDocument.id)}});
    const document=row?.value as unknown as RecruitmentDocument|undefined;
    if(!document||document.kind!=='COVER_LETTER'||document.revision!==input.baseDocument.expectedRevision)fail('DOCUMENT_CONFLICT');
  }
}
async function run(session:CareerSession,provider:DecisionProvider) {
  const input=session.pending!;let current=session;
  const result=await evaluate(input,{sessionId:session.id,draftVersion:session.history.length+1,provider,providerAttempts:session.providerAttempts,onProgress:async progress=>{
    current=await replaceSession(current,{...current,progress});
  },beforeAttempt:async()=>{
    await requireCareerOwner(session.ownerId);
    if(current.providerAttempts>=12)fail('CALL_LIMIT');
    // Persist before the network call; timeout/crash never refunds an ambiguous attempt.
    current=await replaceSession(current,{...current,providerAttempts:current.providerAttempts+1});
  }});
  const previous=current.history[current.selectedVersion-1];
  const comparison=previous?compareCandidate(previous.result,result):{accepted:true,result};
  const history=[...current.history,{input,result:comparison.result,accepted:comparison.accepted}];
  return replaceSession(current,{...current,history,selectedVersion:comparison.accepted?history.length:current.selectedVersion,state:'COMPLETE',pending:null,progress:null});
}
export async function startCareerEvaluation(ownerId:string,value:unknown,requestId:string,provider:DecisionProvider):Promise<CareerSession> {
  await requireCareerOwner(ownerId);
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))fail('INVALID_REQUEST_ID');
  const input=parseInput(value);if(input.sessionId!==null)fail('USE_SESSION_TO_RESUME');
  const id=hash([ownerId,requestId]).slice(7),requestHash=hash(input);
  const existing=await prisma.appSetting.findUnique({where:{key:key(id)}});
  if(existing) {const session=await getCareerSession(ownerId,id);if(session.requestHash!==requestHash)fail('IDEMPOTENCY_CONFLICT');return session;}
  await validateSources(input);
  const now=new Date().toISOString();
  const session:CareerSession={id,ownerId,revision:1,requestHash,state:'RUNNING',providerAttempts:0,history:[],selectedVersion:0,pending:input,progress:null,startedAt:now,updatedAt:now,saved:null};
  try {await prisma.appSetting.create({data:{key:key(id),value:json(session)}});}
  catch(error) {
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002') {
      const concurrent=await getCareerSession(ownerId,id);if(concurrent.requestHash!==requestHash)fail('IDEMPOTENCY_CONFLICT');return concurrent;
    } throw error;
  }
  return run(session,provider);
}
export async function rewriteCareerEvaluation(ownerId:string,value:unknown,provider:DecisionProvider) {
  const request=rewriteSchema.parse(value),session=await getCareerSession(ownerId,request.sessionId);
  if(session.state!=='COMPLETE'||session.history.length>=3||session.saved||session.selectedVersion!==session.history.length)fail('REWRITE_NOT_ALLOWED');
  const previous=session.history[session.selectedVersion-1];
  const input=applyRewrite(previous.input,previous.result,request);
  await validateSources(input);
  const running=await replaceSession(session,{...session,state:'RUNNING',pending:input});
  return run(running,provider);
}
export const saveSchema=z.strictObject({documentId:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),expectedRevision:z.number().int().min(0),title:z.string().min(1).max(200),project:z.string().max(200),summary:z.string().max(2000),confirmed:z.boolean(),evaluationId:z.string(),expectedDraftHash:z.string()});
export async function saveCareerDraft(ownerId:string,id:string,value:unknown):Promise<RecruitmentDocument> {
  const parsed=saveSchema.safeParse(value);if(!parsed.success) return fail('INVALID_SAVE');const options=parsed.data;
  if(options.confirmed!==true)fail('EXPLICIT_SAVE_REQUIRED');
  return prisma.$transaction(async tx=>{
    // Lock identity and session so revocation, competing saves and candidate submission cannot race.
    await tx.$queryRaw`SELECT id FROM access_user WHERE id=${ownerId} FOR UPDATE`;
    await requireCareerOwner(ownerId,tx);
    const sessionKey=key(id);
    await tx.$queryRaw`SELECT key FROM app_setting WHERE key=${sessionKey} FOR UPDATE`;
    const row=await tx.appSetting.findUnique({where:{key:sessionKey}}),session=row?.value as unknown as CareerSession|undefined;
    if(!session||session.ownerId!==ownerId) return fail('SESSION_NOT_FOUND');
    const requestHash=hash(options),docKey=recruitmentKey(options.documentId);
    if(session.saved) {
      if(session.saved.requestHash!==requestHash) return fail('SESSION_ALREADY_SAVED');
      const row=await tx.appSetting.findUnique({where:{key:docKey}}),saved=row?.value as unknown as RecruitmentDocument|undefined;
      if(!saved||saved.revision!==session.saved.revision)return fail('DOCUMENT_CONFLICT');return saved;
    }
    const selected=session.history[session.selectedVersion-1];
    if(session.state!=='COMPLETE'||!selected||selected.result.identity.evaluationId!==options.evaluationId||selected.result.identity.draftHash!==options.expectedDraftHash) return fail('STALE_DRAFT');
    const base=selected.input.baseDocument;
    if(base&&(base.id!==options.documentId||base.expectedRevision!==options.expectedRevision)||!base&&options.expectedRevision!==0)return fail('DOCUMENT_CONFLICT');
    await tx.$queryRaw`SELECT key FROM app_setting WHERE key=${docKey} FOR UPDATE`;
    const current=await tx.appSetting.findUnique({where:{key:docKey}}),old=current?.value as unknown as RecruitmentDocument|undefined;
    if((old?.revision??0)!==options.expectedRevision||old&&old.kind!=='COVER_LETTER')return fail('DOCUMENT_CONFLICT');
    const content=parseRecruitmentDocument({kind:'COVER_LETTER',title:options.title,project:options.project,scope:old?.scope??'PERSONAL',summary:options.summary,tags:old?.tags??[],sourceUrls:old?.sourceUrls??[],sections:selected.input.questions.map(q=>({title:q.prompt.slice(0,100),body:selected.input.answers.find(a=>a.questionId===q.id)!.text}))});
    const document={...content,id:options.documentId,revision:options.expectedRevision+1,updatedAt:new Date().toISOString()};
    if(current) {
      const updated=await tx.appSetting.updateMany({where:{key:docKey,value:{equals:json(current.value)}},data:{value:json(document)}});
      if(updated.count!==1)return fail('DOCUMENT_CONFLICT');
    } else {await tx.appSetting.create({data:{key:docKey,value:json(document)}});}
    await tx.appSetting.update({where:{key:sessionKey},data:{value:json({...session,revision:session.revision+1,updatedAt:document.updatedAt,saved:{requestHash,documentId:document.id,revision:document.revision}})}});
    return document;
  });
}
