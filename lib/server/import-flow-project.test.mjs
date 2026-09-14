import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from './test-db.mjs';
import { importFlowProject } from './import-flow-project.ts';
import { readFlowCatalog, readChartPage, toFlowNavigation } from './flow-catalog-store.ts';

const slug = 'test-import-content';
async function clear() {
  await prisma.flowDocument.deleteMany({ where: { projectSlug: slug } });
  await prisma.flowCategory.deleteMany({ where: { projectSlug: slug } });
  await prisma.flowProject.deleteMany({ where: { slug } });
}
after(async () => { await clear(); await prisma.$disconnect(); });

test('콘텐츠 가져오기는 중복 실행을 차단하고 메뉴에는 본문을 전송하지 않는다', async () => {
  await clear();
  const chart = { slug: 'report', title: '보고서', nodes: [], edges: [], content: { kind: 'html', html: '<h1>보고서 원문</h1>' } };
  const project = { slug, title: '가져오기 검증', categories: [{ slug: 'reports', title: '보고서', charts: [chart] }] };
  const before = await prisma.flowDocument.count();
  await importFlowProject(project);
  assert.equal(await prisma.flowDocument.count(), before + 1);
  await assert.rejects(() => importFlowProject({ ...project, title: '덮어쓰기 시도' }));
  assert.equal((await prisma.flowProject.findUnique({ where: { slug } })).title, project.title);
  const catalog = await readFlowCatalog(slug);
  assert.equal(catalog[0].categories[0].charts[0].contentKind, 'html');
  assert.equal('content' in catalog[0].categories[0].charts[0], false);
  assert.equal(JSON.stringify(toFlowNavigation(catalog)).includes('보고서 원문'), false);
  assert.deepEqual((await readChartPage(slug, 'reports', 'report')).chart.content, chart.content);
  assert.equal(await prisma.flowDocument.count(), before + 1);
});
