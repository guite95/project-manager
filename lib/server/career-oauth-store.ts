import {prisma} from '../db.ts';
import {fail} from '../career/core.ts';
import type {Prisma} from '@prisma/client';
export async function lockOAuthOwner(tx:Prisma.TransactionClient,id:string) {
  await tx.$queryRaw`SELECT id FROM access_user WHERE id=${id} FOR UPDATE`;
  const owner=await tx.accessUser.findUnique({where:{id}});
  if(!owner?.active||owner.role!=='OWNER')return fail('MCP_OWNER_REQUIRED');
  return owner;
}
export async function assertCareerOAuthEpoch(id:string,epoch:number):Promise<void>{
  const owner=await prisma.accessUser.findUnique({where:{id},select:{active:true,role:true,oauthEpoch:true}});
  if(!owner?.active||owner.role!=='OWNER'||owner.oauthEpoch!==epoch)fail('MCP_UNAUTHORIZED');
}
export async function revokeInTransaction(tx:Prisma.TransactionClient,id:string):Promise<void>{
  await tx.accessUser.update({where:{id},data:{oauthEpoch:{increment:1}}});
  await tx.careerOAuthConsent.deleteMany({where:{userId:id}});
  // Leave grants for audit; epoch validation denies both access and refresh immediately.
}
export async function revokeCareerOAuth(id:string):Promise<void>{
  await prisma.$transaction(async tx=>{await lockOAuthOwner(tx,id);await revokeInTransaction(tx,id);});
}
