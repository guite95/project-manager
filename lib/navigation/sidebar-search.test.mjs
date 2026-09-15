import assert from "node:assert/strict";
import test from "node:test";
const api = await import("./sidebar-search.ts").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const projects = [{ slug: "tns", title: "티엔에스", categories: [
  { slug: "trade", title: "무역 프로세스", charts: [
    { slug: "order", title: "주문 흐름", description: "해외 발주", nodes: [], edges: [] },
    { slug: "stock", title: "재고", description: "WMS 입고", nodes: [], edges: [] },
  ] },
] }];

test("자료가 없는 프로젝트도 회의록 메뉴로 검색된다", () => {
  const result = api.searchSidebarProjects([...projects, { slug: 'empty', title: '신규', categories: [] }], '회의록');
  assert.deepEqual(result.map(p => p.project.slug), ['tns', 'empty']);
  assert.ok(result.every(p => p.showMeetings));
  assert.equal(api.searchSidebarProjects(projects, 'WMS')[0].showMeetings, false);
});

test("프로젝트명과 카테고리명 검색은 그 아래 자료 전체를 찾는다", () => {
  assert.equal(typeof api.searchSidebarProjects, "function");
  for (const q of ["티엔에스", "무역", "  "]) {
    assert.equal(api.searchSidebarProjects(projects, q)[0].categories[0].charts.length, 2);
  }
});
test("차트 설명 검색은 해당 차트로 바로 이동할 결과를 보존한다", () => {
  assert.equal(typeof api.searchSidebarProjects, "function");
  const result = api.searchSidebarProjects(projects, " wms ");
  assert.deepEqual(result[0].categories[0].charts.map(c => c.slug), ["stock"]);
  assert.deepEqual(api.searchSidebarProjects(projects, "없는메뉴"), []);
  assert.equal(projects[0].categories[0].charts.length, 2);
});
