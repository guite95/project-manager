import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from './test-db.mjs';
import { createMaterial, deleteMaterial, listMaterials, getMaterial } from './materials-store.ts';
import { readFlowCatalog } from './flow-catalog-store.ts';
import { updateFlowDocument } from './flows-store.ts';

const projects = ['test-materials-a', 'test-materials-b'];
for (const key of ['OCI_STORAGE_REGION', 'OCI_STORAGE_NAMESPACE', 'OCI_STORAGE_BUCKET']) delete process.env[key];
const bytes = Buffer.from('<!doctype html><h1>자료 원문</h1>');
const content = { kind: 'material', format: 'html', fileName: '자료.html', byteLength: bytes.length, data: bytes.toString('base64') };
async function clear() {
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'storage:delete:materials:' } } });
  await prisma.flowDocument.deleteMany({ where: { projectSlug: { in: projects } } });
  await prisma.flowCategory.deleteMany({ where: { projectSlug: { in: projects } } });
  await prisma.flowProject.deleteMany({ where: { slug: { in: projects } } });
}
before(async () => { await clear(); await prisma.flowProject.createMany({ data: projects.map(slug => ({ slug, title: slug, position: 999 })) }); });
after(async () => { await clear(); await prisma.$disconnect(); });

test('동시 자료 추가는 원문을 각각 보존하고 프로젝트별로 분리된다', async () => {
  const [a, b] = await Promise.all([createMaterial(projects[0], '첫 자료', content), createMaterial(projects[0], '둘째 자료', content)]);
  assert.notEqual(a.slug, b.slug);
  const stored = await getMaterial(projects[0], a.slug);
  assert.deepEqual(stored.chart.content, content);
  assert.equal(stored.revision, 1);
  assert.equal(await getMaterial(projects[1], a.slug), null);
  assert.deepEqual(await listMaterials(projects[1]), []);
  const list = await listMaterials(projects[0]);
  assert.equal(list.length, 2);
  assert.ok(list.every(m => m.format === 'html' && m.fileName === '자료.html'));
  for (const result of [list, await readFlowCatalog(projects[0])]) {
    assert.equal(JSON.stringify(result).includes(content.data), false);
    assert.equal(JSON.stringify(result).includes('"content"'), false);
  }
});

test('없는 프로젝트와 잘못된 자료는 저장하지 않는다', async () => {
  assert.equal(await createMaterial('missing-material-project', '자료', content), null);
  await assert.rejects(() => createMaterial(projects[0], ' ', content));
  await assert.rejects(() => createMaterial(projects[0], '자료', { ...content, data: 'bad' }));
  assert.equal((await listMaterials(projects[0])).length, 2);
});

test('기존 HTML·슬라이드도 같은 프로젝트 자료 목록과 상세에서 읽는다', async () => {
  await prisma.flowDocument.create({ data: { projectSlug: projects[0], categorySlug: 'project-materials', slug: 'legacy-html', position: 9,
    document: { slug: 'legacy-html', title: '기존 HTML', nodes: [], edges: [], content: { kind: 'html', html: '<h1>기존 자료</h1>' } } } });
  assert.equal((await listMaterials(projects[0])).find(m => m.slug === 'legacy-html').format, 'html');
  assert.equal((await getMaterial(projects[0], 'legacy-html')).chart.content.html, '<h1>기존 자료</h1>');
});

test('자료 삭제는 프로젝트와 자료 종류를 제한하고 반복 삭제를 구분한다', async () => {
  const material = await createMaterial(projects[0], '삭제할 자료', content);
  assert.equal(await deleteMaterial(projects[1], material.slug), false);
  assert.ok(await getMaterial(projects[0], material.slug));
  assert.equal(await deleteMaterial(projects[0], material.slug), true);
  assert.equal(await getMaterial(projects[0], material.slug), null);
  assert.equal((await listMaterials(projects[0])).some(row => row.slug === material.slug), false);
  assert.equal(await deleteMaterial(projects[0], material.slug), false);
  assert.equal(await deleteMaterial('common', material.slug), false);

  for (const kind of ['html', 'slides', 'meeting', 'schedule', 'erd', 'notice', null]) {
    const slug = `delete-kind-${kind}`;
    for (const projectSlug of projects) {
      await prisma.flowCategory.createMany({ data: [{ projectSlug, slug: 'project-materials', title: '자료', position: 999 }], skipDuplicates: true });
      await prisma.flowDocument.create({ data: { projectSlug, categorySlug: 'project-materials', slug, position: 999,
        document: { slug, title: slug, nodes: [], edges: [], ...(kind ? { content: { kind } } : {}) } } });
    }
    const removable = ['html', 'slides'].includes(kind);
    assert.equal(await deleteMaterial(projects[0], slug), removable);
    assert.equal(await prisma.flowDocument.count({ where: { projectSlug: projects[0], slug } }), removable ? 0 : 1);
    assert.equal(await prisma.flowDocument.count({ where: { projectSlug: projects[1], slug } }), 1);
  }
});

test('OCI 참조 변조를 거부하고 객체 삭제 실패는 DB 정리 작업으로 남긴다', async () => {
  const material = await createMaterial(projects[0], 'OCI 삭제', content);
  const row = await prisma.flowDocument.findUnique({ where: { projectSlug_slug: { projectSlug: projects[0], slug: material.slug } } });
  const storage = { provider: 'oci', version: 1, key: 'unconfigured-test-object' };
  const previewStorage = { provider: 'oci', version: 1, key: 'unconfigured-test-preview' };
  await assert.rejects(() => updateFlowDocument(projects[0], material.slug, { ...row.document, content: { ...content, storage } }, row.revision));
  await prisma.flowDocument.update({ where: { projectSlug_slug: { projectSlug: projects[0], slug: material.slug } }, data: { document: { ...row.document, content: { ...content, storage, preview: { format: 'pdf', fileName: '자료.pdf', byteLength: 15, storage: previewStorage } } } } });
  await assert.rejects(() => updateFlowDocument(projects[0], material.slug, row.document, row.revision));
  assert.equal(await deleteMaterial(projects[0], material.slug), true);
  const jobs = await prisma.appSetting.findMany({ where: { key: { startsWith: 'storage:delete:materials:' } } });
  const own = jobs.filter(j => j.value.project === projects[0] && j.value.slug === material.slug);
  assert.equal(own.length, 2);
  assert.deepEqual(new Set(own.map(job => job.value.storage.key)), new Set([storage.key, previewStorage.key]));
  await prisma.appSetting.deleteMany({ where: { key: { in: own.map(job => job.key) } } });
});
