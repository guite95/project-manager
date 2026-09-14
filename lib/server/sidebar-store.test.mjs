import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { prisma } from "./test-db.mjs";

const KEY = "sidebar:project-order";
const load = () => import("./sidebar-store.ts").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

beforeEach(() => prisma.appSetting.deleteMany({where:{key:KEY}}));
after(async () => {
  await prisma.appSetting.deleteMany({where:{key:KEY}});
  await prisma.$disconnect();
});

test("저장 전에는 기본 순서, 저장 후에는 외부 프로젝트를 포함한 순서를 복원한다", async () => {
  const {loadSidebarOrder, saveSidebarOrder} = await load();
  assert.equal(typeof loadSidebarOrder, "function");
  const initial = await loadSidebarOrder();
  assert.ok(initial.includes("focus-ai"));
  const next = [...initial].reverse();
  const boardBefore = await prisma.appSetting.findUnique({where:{key:"board"}});
  assert.deepEqual(await saveSidebarOrder(next), next);
  assert.deepEqual(await loadSidebarOrder(), next);
  assert.deepEqual(await prisma.appSetting.findUnique({where:{key:"board"}}), boardBefore);
});

test("잘못된 순서 요청은 이전 설정을 덮어쓰지 않는다", async () => {
  const {loadSidebarOrder, saveSidebarOrder} = await load();
  assert.equal(typeof loadSidebarOrder, "function");
  const initial = await loadSidebarOrder();
  await saveSidebarOrder(initial);
  for (const invalid of [null, {}, ["unknown"], ["focus-ai", "focus-ai"], [3]]) {
    await assert.rejects(() => saveSidebarOrder(invalid));
    assert.deepEqual(await loadSidebarOrder(), initial);
  }
});
