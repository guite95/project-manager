import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { prisma } from './test-db.mjs';

const slug = 'test-light-catalog';
const chart = { slug: 'first', title: '주문', description: '주문 설명', nodes: [{ id: 'a', data: { kind: 'entry', label: '접수' } }], edges: [] };
const load = () => import('./flow-catalog-store.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
async function clear() {
  await prisma.flowDocument.deleteMany({ where: { projectSlug: slug } });
  await prisma.flowCategory.deleteMany({ where: { projectSlug: slug } });
  await prisma.flowProject.deleteMany({ where: { slug } });
}
beforeEach(async () => {
  await clear();
  await prisma.flowProject.create({ data: { slug, title: '테스트', intro: '소개', position: 999, categories: { create: [
    { slug: 'work', title: '업무', position: 0, charts: { create: [
      { slug: 'first', position: 0, document: chart },
      { slug: 'second', position: 1, document: { ...chart, slug: 'second', title: '다른 차트', nodes: [{ id: 'bad', data: { kind: 'invalid' } }] } },
    ] } },
    { slug: 'empty', title: '빈 카테고리', position: 1 },
  ] } } });
});
after(async () => { await clear(); await prisma.$disconnect(); });

test('목록은 그래프 본문 없이 설명과 개수만 반환하고 DB 변경을 다음 조회에 반영한다', async () => {
  const api = await load();
  assert.equal(typeof api.readFlowCatalog, 'function');
  const project = (await api.readFlowCatalog(slug))[0];
  assert.equal(project.intro, '소개');
  assert.deepEqual(project.categories[0].charts[0], {
    slug: 'first', title: '주문', description: '주문 설명', nodeCount: 1, edgeCount: 0,
  });
  assert.deepEqual(project.categories[1].charts, []);
  assert.equal(JSON.stringify(project).includes('"nodes"'), false);
  await prisma.flowDocument.update({ where: { projectSlug_slug: { projectSlug: slug, slug: 'first' } }, data: { document: { ...chart, title: '수정된 제목' } } });
  assert.equal((await api.readFlowCatalog(slug))[0].categories[0].charts[0].title, '수정된 제목');
  assert.deepEqual(await api.readFlowCatalog("missing' OR 1=1 --"), []);
});

test('메뉴 전달값에는 프로젝트 소개와 그래프 개수도 포함하지 않는다', async () => {
  const api = await load();
  assert.equal(typeof api.toFlowNavigation, 'function');
  const result = api.toFlowNavigation(await api.readFlowCatalog(slug));
  assert.deepEqual(result[0].categories[0].charts[0], { slug: 'first', title: '주문', description: '주문 설명' });
  assert.equal('intro' in result[0], false);
});

test('상세는 선택한 차트만 검증하고 잘못된 URL은 기존 첫 차트 규칙으로 처리한다', async () => {
  const api = await load();
  assert.equal(typeof api.readChartPage, 'function');
  const selected = await api.readChartPage(slug, 'work', 'first');
  assert.equal(selected.chart.nodes[0].id, 'a');
  assert.equal((await api.readChartPage(slug, 'unknown', 'missing')).chart.slug, 'first');
  assert.equal(await api.readChartPage(slug, 'empty'), null);
  assert.equal(await api.readChartPage('missing'), null);
  // 다른 차트의 손상된 그래프가 정상 차트 조회를 막아서는 안 된다.
  await assert.rejects(() => api.readChartPage(slug, 'work', 'second'));
});
