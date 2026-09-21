import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { hashPassword, verifyPassword } from '../password.ts';
import { isSessionTokenValid } from '../session.ts';
import { isPersonalProject } from '../personal-projects.ts';
import { type Actor, isAdmin } from './policy.ts';
import { readFlowCatalog } from '../server/flow-catalog-store.ts';
import { getRuntimeSecret } from '../server/runtime-secrets.mjs';

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const tokenValid = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
export const userSelect = {id:true,username:true,name:true,role:true,active:true,memberships:{select:{projectSlug:true,role:true}}} as const;
export const hasOwner = async () => Boolean(await prisma.accessUser.findFirst({where:{role:'OWNER'},select:{id:true}}));
export async function resolveActor(token: string): Promise<Actor | null> {
  if (token.startsWith('v2.')) {
    const raw = token.slice(3);
    if (!tokenValid(raw)) return null;
    const row = await prisma.accessSession.findUnique({where:{tokenHash:tokenHash(raw)},include:{user:{select:userSelect}}});
    return row && row.expiresAt > new Date() && row.user.active ? row.user : null;
  }
  const secret = getRuntimeSecret('SESSION_SECRET');
  if (!secret || !token || !await isSessionTokenValid(token,secret,Date.now())) return null;
  if (await hasOwner()) return null;
  return {id:'bootstrap',username:'',name:'소유자 등록',role:'OWNER',bootstrap:true,memberships:[]};
}
export async function issueSession(userId: string, expectedPasswordHash?: string) {
  const token = newToken();
  await prisma.$transaction(async tx=>{
    // 비밀번호/권한 변경의 UPDATE와 같은 행 잠금으로 세션 발급을 직렬화한다.
    await tx.$queryRaw`SELECT id FROM access_user WHERE id=${userId} FOR UPDATE`;
    const user=await tx.accessUser.findUnique({where:{id:userId}});
    if(!user?.active || expectedPasswordHash!==undefined && user.passwordHash!==expectedPasswordHash) throw new AccessError('계정 정보가 변경되었습니다. 다시 로그인하세요.',401);
    await tx.accessSession.create({data:{tokenHash:tokenHash(token),userId,expiresAt:new Date(Date.now()+30*86400_000)}});
  });
  return `v2.${token}`;
}
export async function revokeSession(token: string) {
  if (token.startsWith('v2.')) await prisma.accessSession.deleteMany({where:{tokenHash:tokenHash(token.slice(3))}});
}
export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128) throw new AccessError('비밀번호는 1~128자로 입력하세요.');
  return value;
}
function identity(body: Record<string,unknown>) {
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!/^[a-z0-9._-]{3,64}$/.test(username) || !name || name.length > 80) throw new AccessError('계정 ID(영문·숫자 3~64자)와 이름(80자 이하)을 확인하세요.');
  return {username,name};
}
const audit = (tx: Prisma.TransactionClient, actor: Actor, action: string, target: string) => tx.accessAudit.create({data:{id:randomUUID(),actorId:actor.id,action,target}});
/** DB 원자적 카운터라 재시작/여러 프로세스로 제한을 우회하지 못한다. */
export async function throttle(key: string, limit = 10) {
  const now = Date.now();
  const id = tokenHash(key);
  const expiry = new Date(now+15*60_000);
  const rows = await prisma.$queryRaw<{attempts:number}[]>`
    INSERT INTO access_throttle (key,attempts,expires_at) VALUES (${id},1,${expiry})
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN access_throttle.expires_at < ${new Date(now)} THEN 1 ELSE access_throttle.attempts + 1 END,
      expires_at = CASE WHEN access_throttle.expires_at < ${new Date(now)} THEN ${expiry} ELSE access_throttle.expires_at END
    RETURNING attempts`;
  if (rows[0].attempts > limit) throw new AccessError('시도가 너무 많습니다. 15분 후 다시 시도하세요.',429);
}
export async function loginAccount(username: string, password: string) {
  await throttle('login:global',200);
  await throttle(`login:${username || 'bootstrap'}`);
  if (!username) {
    const hash = getRuntimeSecret('APP_PASSWORD_HASH');
    if (await hasOwner() || !hash || !await verifyPassword(password,hash)) throw new AccessError('계정 또는 비밀번호가 맞지 않습니다.',401);
    return null;
  }
  const user = await prisma.accessUser.findUnique({where:{username}});
  // 존재하지 않는 계정에도 같은 scrypt 비용을 부여한다.
  const dummyHash = `${'00'.repeat(16)}:${'00'.repeat(64)}`;
  const valid = await verifyPassword(password,user?.passwordHash ?? dummyHash);
  if (!valid || !user?.active) throw new AccessError('계정 또는 비밀번호가 맞지 않습니다.',401);
  return issueSession(user.id,user.passwordHash);
}
export async function bootstrapOwner(actor: Actor, body: Record<string,unknown>) {
  if (!actor.bootstrap) throw new AccessError('소유자 등록이 이미 완료되었습니다.',403);
  const fields = identity(body);
  const passwordHash = await hashPassword(validatePassword(body.password));
  const id = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(18092026)`;
    if (await tx.accessUser.findFirst({where:{role:'OWNER'}})) throw new AccessError('소유자가 이미 등록되었습니다.',409);
    await tx.accessUser.create({data:{id,...fields,passwordHash,role:'OWNER'}});
    await audit(tx,actor,'OWNER_CREATED',id);
  });
  return issueSession(id);
}
export async function accessOverview(actor: Actor) {
  if (!isAdmin(actor)) throw new AccessError('관리자 권한이 필요합니다.',403);
  const [users,projects,shares] = await Promise.all([
    prisma.accessUser.findMany({where:actor.role==='OWNER'?undefined:{role:{not:'OWNER'}},select:userSelect,orderBy:{createdAt:'asc'}}),
    readFlowCatalog(),
    prisma.accessShare.findMany({where:{expiresAt:{gt:new Date()}},select:{id:true,projectSlug:true,chartSlug:true,expiresAt:true}}),
  ]);
  return {actor,users:actor.role==='OWNER'?users:users.map(user=>({...user,memberships:user.memberships.filter(m=>!isPersonalProject(m.projectSlug))})),projects:projects.filter(p=>actor.role==='OWNER'||!isPersonalProject(p.slug)).map(p=>({slug:p.slug,title:p.title,charts:p.categories.flatMap(c=>c.charts.flatMap(d=>{
    return d.erdDomain ? [] : [{slug:d.slug,title:d.title}];
  }))})),shares:shares.filter(s=>!isPersonalProject(s.projectSlug))};
}
export async function manageAccess(actor: Actor, body: Record<string,unknown>): Promise<{path:string}|null> {
  if (!isAdmin(actor) || actor.bootstrap) throw new AccessError('계정 등록 후 관리자 권한으로 이용하세요.',403);
  if (body.action === 'createUser') {
    const fields=identity(body);
    const role=body.role;
    if (!['MEMBER','ADMIN'].includes(String(role)) || role==='ADMIN' && actor.role!=='OWNER') throw new AccessError('부여할 수 없는 역할입니다.',403);
    const passwordHash=await hashPassword(validatePassword(body.password));
    await prisma.$transaction(async tx=>{
      if(await tx.accessUser.findUnique({where:{username:fields.username}})) throw new AccessError('이미 사용 중인 계정 ID입니다.',409);
      const user=await tx.accessUser.create({data:{id:randomUUID(),...fields,role:String(role),passwordHash,active:true}});
      await audit(tx,actor,'USER_CREATED',JSON.stringify({id:user.id,username:user.username,role:user.role}));
    });
    // 관리자 자신의 세션을 유지하며 새 계정의 비밀번호/해시를 응답하지 않는다.
    return null;
  }
  if (body.action === 'updateUser') {
    const id=String(body.id??'');
    if (typeof body.active!=='boolean' || !['ADMIN','MEMBER'].includes(String(body.role)) || !Array.isArray(body.memberships) || body.memberships.length>500) throw new AccessError('계정 권한 형식을 확인하세요.');
    const memberships=body.memberships.map((m:unknown)=>{
      if (!m || typeof m!=='object' || !('projectSlug' in m) || !('role' in m) || typeof m.projectSlug!=='string' || !['VIEWER','EDITOR'].includes(String(m.role)) || actor.role!=='OWNER' && isPersonalProject(m.projectSlug)) throw new AccessError('허용할 수 없는 프로젝트 권한입니다.');
      return {userId:id,projectSlug:m.projectSlug,role:String(m.role)};
    });
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM access_user WHERE id=${id} FOR UPDATE`;
      const target=await tx.accessUser.findUnique({where:{id}});
      if(!target || target.role==='OWNER' || target.id===actor.id || actor.role!=='OWNER' && (target.role==='ADMIN' || body.role==='ADMIN')) throw new AccessError('이 계정의 권한을 변경할 수 없습니다.',403);
      await tx.accessUser.update({where:{id},data:{role:String(body.role),active:body.active as boolean}});
      // 개인 프로젝트 권한은 소유자만 변경한다. 관리자 수정 시 기존 부여를 보존한다.
      const existing = actor.role==='OWNER' ? [] : await tx.accessMembership.findMany({where:{userId:id},select:{projectSlug:true}});
      const privateSlugs = existing.filter(m=>isPersonalProject(m.projectSlug)).map(m=>m.projectSlug);
      await tx.accessMembership.deleteMany({where:{userId:id,...(privateSlugs.length?{projectSlug:{notIn:privateSlugs}}:{})}});
      await tx.accessMembership.createMany({data:memberships});
      // 권한은 요청마다 DB에서 읽는다. 비활성화할 때만 기존 세션을 폐기한다.
      if (!body.active) await tx.accessSession.deleteMany({where:{userId:id}});
      await audit(tx,actor,'USER_ACCESS_CHANGED',JSON.stringify({id,role:body.role,active:body.active,memberships}));
    });
    return null;
  }
  if(body.action==='share') {
    const projectSlug=String(body.projectSlug??''),chartSlug=String(body.chartSlug??'');
    const days=body.days??7;
    if(!Number.isInteger(days) || Number(days)<1 || Number(days)>90 || isPersonalProject(projectSlug)) throw new AccessError('공유 프로젝트와 기간(1~90일)을 확인하세요.');
    const token=newToken();
    await prisma.$transaction(async tx=>{
      const doc=await tx.flowDocument.findUnique({where:{projectSlug_slug:{projectSlug,slug:chartSlug}}});
      if(!doc || (doc.document as {erdDomain?:string}).erdDomain) throw new AccessError('공유할 수 없는 문서입니다.');
      const share=await tx.accessShare.create({data:{id:randomUUID(),projectSlug,chartSlug,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+Number(days)*86400_000)}});
      await audit(tx,actor,'SHARE_CREATED',JSON.stringify({id:share.id,projectSlug,chartSlug}));
    });
    return {path:`/share/${token}`};
  }
  if(body.action==='revokeShare') {
    await prisma.$transaction(async tx=>{
      await tx.accessShare.deleteMany({where:{id:String(body.id)}});
      await audit(tx,actor,'SHARE_REVOKED',String(body.id));
    });return null;
  }
  throw new AccessError('지원하지 않는 요청입니다.');
}
export async function changePassword(actor: Actor, current: unknown, password: unknown) {
  if(actor.bootstrap) throw new AccessError('소유자 계정을 먼저 등록하세요.');
  await throttle(`password:${actor.id}`);
  const user=await prisma.accessUser.findUnique({where:{id:actor.id}});
  if(typeof current!=='string' || current.length>128 || !user || !await verifyPassword(current,user.passwordHash)) throw new AccessError('현재 비밀번호가 맞지 않습니다.',403);
  const passwordHash=await hashPassword(validatePassword(password));
  await prisma.$transaction(async tx=>{
    const updated=await tx.accessUser.updateMany({where:{id:actor.id,passwordHash:user.passwordHash,active:true},data:{passwordHash}});
    if(updated.count!==1) throw new AccessError('계정 정보가 변경되었습니다. 다시 로그인하세요.',401);
    await tx.accessSession.deleteMany({where:{userId:actor.id}});
    await audit(tx,actor,'PASSWORD_CHANGED',actor.id);
  });
  return issueSession(actor.id,passwordHash);
}
export async function resolveShare(token: string) {
  if(!tokenValid(token)) return null;
  const share=await prisma.accessShare.findUnique({where:{tokenHash:tokenHash(token)}});
  if(!share || share.expiresAt<=new Date() || isPersonalProject(share.projectSlug)) return null;
  return share;
}
