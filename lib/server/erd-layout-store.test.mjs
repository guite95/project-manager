import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { prisma } from './test-db.mjs';
import { tnsSchema } from '../erd/tns.ts';
import { ERD_LAYOUT_PREFIX, erdLayoutKey } from '../erd/saved-layout.ts';
import { getTnsErdLayout, inspectTnsErdLayouts, initializeTnsErdLayouts } from './erd-layout-store.ts';

const names=new Set(['user','session']);
const snapshot={...tnsSchema,models:tnsSchema.models.filter(m=>names.has(m.name)),relations:tnsSchema.relations.filter(r=>names.has(r.source)&&names.has(r.target))};
const where={OR:[{key:'erd:tns'},{key:{startsWith:ERD_LAYOUT_PREFIX}}]};
let original=[];
const directory=await mkdtemp(join(tmpdir(),'erd-layout-store-'));
before(async()=>{ original=await prisma.appSetting.findMany({where}); });
beforeEach(async()=>{
  await prisma.appSetting.deleteMany({where});
  await prisma.appSetting.create({data:{key:'erd:tns',value:snapshot}});
});
after(async()=>{
  await prisma.appSetting.deleteMany({where});
  if(original.length) await prisma.appSetting.createMany({data:original});
  await rm(directory,{recursive:true,force:true});
  await prisma.$disconnect();
});
test('미등록 배치 조회·검사는 읽기 전용이다',async()=>{
  const before=await prisma.appSetting.findMany({orderBy:{key:'asc'}});
  assert.equal(await getTnsErdLayout(snapshot,'organization'),null);
  const preview=await inspectTnsErdLayouts();
  assert.equal(preview.missing,12);
  assert.deepEqual(await prisma.appSetting.findMany({orderBy:{key:'asc'}}),before);
});
test('검증된 백업 뒤 배치를 저장하고 DB에서 수정한 좌표는 다시 계산하지 않는다',async()=>{
  const beforeDocs=await prisma.flowDocument.findMany({where:{projectSlug:'tns'}});
  const preview=await inspectTnsErdLayouts();
  const result=await initializeTnsErdLayouts(preview.token,directory);
  assert.equal(result.created,12);
  assert.equal((await stat(result.backup)).mode&0o777,0o600);
  const raw=await readFile(result.backup);
  assert.equal(createHash('sha256').update(raw).digest('hex'),result.backupSha256);
  assert.equal(JSON.parse(raw).state.layouts.length,0);
  const layout=await getTnsErdLayout(snapshot,'organization');
  layout.revision=2;
  for(const n of [...layout.layout.nodes,...layout.layout.groups]) n.x+=100;
  for(const ports of Object.values(layout.routing.ports)) for(const p of ports) p.x+=100;
  for(const r of layout.routing.routes) for(const p of r.points) p.x+=100;
  layout.layout.width+=100;
  await prisma.appSetting.update({where:{key:erdLayoutKey('organization')},data:{value:layout}});
  assert.deepEqual(await getTnsErdLayout(snapshot,'organization'),layout);
  assert.equal((await initializeTnsErdLayouts((await inspectTnsErdLayouts()).token,directory)).created,0);
  assert.deepEqual(await getTnsErdLayout(snapshot,'organization'),layout);
  assert.deepEqual(await prisma.flowDocument.findMany({where:{projectSlug:'tns'}}),beforeDocs);
  assert.deepEqual((await prisma.appSetting.findUnique({where:{key:'erd:tns'}})).value,snapshot);
});
test('스냅샷 변경·오래된 검사 토큰·백업 실패는 배치 쓰기로 이어지지 않는다',async()=>{
  const preview=await inspectTnsErdLayouts();
  await prisma.appSetting.update({where:{key:'erd:tns'},data:{value:{...snapshot,source:'changed'}}});
  await assert.rejects(()=>initializeTnsErdLayouts(preview.token,directory),/변경/);
  const file=join(directory,'not-a-directory'); await writeFile(file,'test');
  const current=await inspectTnsErdLayouts();
  await assert.rejects(()=>initializeTnsErdLayouts(current.token,file));
  assert.equal(await prisma.appSetting.count({where:{key:{startsWith:ERD_LAYOUT_PREFIX}}}),0);
});
test('동시 초기화는 한 번만 반영되고 구조가 바뀐 배치를 재사용하지 않는다',async()=>{
  const preview=await inspectTnsErdLayouts();
  const results=await Promise.allSettled([initializeTnsErdLayouts(preview.token,directory),initializeTnsErdLayouts(preview.token,directory)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await prisma.appSetting.count({where:{key:{startsWith:ERD_LAYOUT_PREFIX}}}),12);
  assert.equal(await getTnsErdLayout({...snapshot,source:'updated'},'organization'),null);
});
