import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from './test-db.mjs';
import { createMaterial, listMaterials, getMaterial } from './materials-store.ts';
import { readFlowCatalog } from './flow-catalog-store.ts';

const projects = ['test-materials-a', 'test-materials-b'];
const bytes = Buffer.from('<!doctype html><h1>자료 원문</h1>');
const content = { kind: 'material', format: 'html', fileName: '자료.html', byteLength: bytes.length, data: bytes.toString('base64') };
async function clear() {
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
