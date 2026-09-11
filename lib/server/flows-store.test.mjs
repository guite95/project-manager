import assert from 'node:assert/strict';
import {after, beforeEach, test} from 'node:test';
import {prisma} from './test-db.mjs';

const doc = {slug:'test-chart',title:'DB에서 읽은 제목',nodes:[{id:'a',data:{kind:'entry',label:'접수'}}],edges:[]};
beforeEach(async()=>{
  await prisma.flowDocument.deleteMany({where:{projectSlug:'test-catalog'}});
  await prisma.flowCategory.deleteMany({where:{projectSlug:'test-catalog'}});
  await prisma.flowProject.deleteMany({where:{slug:'test-catalog'}});
  await prisma.flowProject.create({data:{slug:'test-catalog',title:'테스트 프로젝트',position:999,categories:{create:{slug:'work',title:'업무',position:0,charts:{create:{slug:doc.slug,document:doc,position:0}}}}}});
});
after(async()=>{
  await prisma.flowDocument.deleteMany({where:{projectSlug:'test-catalog'}});
  await prisma.flowCategory.deleteMany({where:{projectSlug:'test-catalog'}});
  await prisma.flowProject.deleteMany({where:{slug:'test-catalog'}});
  await prisma.$disconnect();
});
const load=()=>import('./flows-store.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('catalog reflects DB edits on the next read', async()=>{
  const {getFlowProject}=await load();assert.equal(typeof getFlowProject,'function');
  assert.equal((await getFlowProject('test-catalog')).categories[0].charts[0].title,'DB에서 읽은 제목');
  await prisma.flowDocument.update({where:{projectSlug_slug:{projectSlug:'test-catalog',slug:doc.slug}},data:{document:{...doc,title:'변경된 제목'}}});
  assert.equal((await getFlowProject('test-catalog')).categories[0].charts[0].title,'변경된 제목');
  assert.equal(await getFlowProject('nonexistent'),undefined);
});
test('concurrent edits reject stale revisions without overwriting the winner',async()=>{
  const {updateFlowDocument,getFlowDocument}=await load();assert.equal(typeof updateFlowDocument,'function');
  const results=await Promise.all([
    updateFlowDocument('test-catalog',doc.slug,{...doc,title:'첫 변경'},1),
    updateFlowDocument('test-catalog',doc.slug,{...doc,title:'다른 변경'},1),
  ]);
  assert.deepEqual(results.map(r=>r.status).sort(),['conflict','updated']);
  const saved=await getFlowDocument('test-catalog',doc.slug);
  assert.equal(saved.revision,2);
  assert.ok(['첫 변경','다른 변경'].includes(saved.chart.title));
  await assert.rejects(()=>updateFlowDocument('test-catalog',doc.slug,{...doc,slug:'different'},2));
  await assert.rejects(()=>updateFlowDocument('test-catalog',doc.slug,{...doc,edges:[{id:'bad',source:'a',target:'missing',kind:'impl'}]},2));
  assert.equal((await getFlowDocument('test-catalog',doc.slug)).revision,2);
});
