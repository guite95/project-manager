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

test('content save preserves layout and explicit empty layout resets it', async () => {
  const { updateFlowDocument, getFlowDocument } = await load();
  const layout = { nodes: { a: { x: 120, y: 300 } }, edges: {} };
  await updateFlowDocument('test-catalog', doc.slug, { ...doc, layout }, 1);
  await updateFlowDocument('test-catalog', doc.slug, { ...doc, title: '내용 변경' }, 2);
  assert.deepEqual((await getFlowDocument('test-catalog', doc.slug)).chart.layout, layout);
  await updateFlowDocument('test-catalog', doc.slug, { ...doc, layout: { nodes: {}, edges: {} } }, 3);
  assert.deepEqual((await getFlowDocument('test-catalog', doc.slug)).chart.layout, { nodes: {}, edges: {} });
});

test('CLI applies after verified backup, rejects stale revision and creates only with revision zero', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createHash } = await import('node:crypto');
  const { applyFlowEnvelope } = await import('./flow-cli-store.ts');
  const dir = await mkdtemp(join(tmpdir(), 'flow-cli-test-'));
  const envelope = { projectSlug: 'test-catalog', categorySlug: 'work', revision: 1, chart: { ...doc, title: 'CLI 수정' } };
  try {
    const saved = await applyFlowEnvelope(envelope, dir);
    const backup = await readFile(saved.backup, 'utf8');
    assert.equal(createHash('sha256').update(backup).digest('hex'), saved.sha256);
    assert.deepEqual(JSON.parse(backup).chart, doc);
    assert.equal(saved.revision, 2);
    await assert.rejects(() => applyFlowEnvelope(envelope, dir), /revision/);
    const created = await applyFlowEnvelope({ ...envelope, revision: 0, chart: { ...doc, slug: 'new-chart' } }, dir);
    assert.equal(created.revision, 1);
    await assert.rejects(() => applyFlowEnvelope({ ...envelope, revision: 0, chart: { ...doc, slug: 'new-chart' } }, dir), /revision/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
