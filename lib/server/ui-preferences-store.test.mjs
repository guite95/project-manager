import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { prisma } from "./test-db.mjs";

const keys = ["ui:navigation", "ui:reference-columns", "ui:personal-project-groups"];
const load = () => import("./ui-preferences-store.ts").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
beforeEach(() => prisma.appSetting.deleteMany({ where: { key: { in: keys } } }));
after(async () => {
  await prisma.appSetting.deleteMany({ where: { key: { in: keys } } });
  await prisma.$disconnect();
});

test("개인 프로젝트 분류는 조회로 생성하지 않고 변경한 프로젝트만 병합하여 복원한다", async () => {
  const api = await load();
  const scope = "personal-project-groups";
  assert.deepEqual(await api.loadUiPreferences(scope), { exists: false, values: {} });
  assert.equal(await prisma.appSetting.count({ where: { key: `ui:${scope}` } }), 0);
  await api.saveUiPreferences(scope, { 'personal-ilchul': 'toy' });
  await Promise.all([
    api.saveUiPreferences(scope, { 'personal-flight-app': 'toy' }),
    api.saveUiPreferences(scope, { 'personal-project-management': 'portfolio' }),
  ]);
  assert.deepEqual((await api.loadUiPreferences(scope)).values, {
    'personal-ilchul': 'toy', 'personal-flight-app': 'toy', 'personal-project-management': 'portfolio',
  });
});

test("설정 조회는 DB를 변경하지 않고 저장한 값은 새 조회에서 복원한다", async () => {
  const api = await load();
  assert.equal(typeof api.loadUiPreferences, "function");
  assert.deepEqual(await api.loadUiPreferences("navigation"), { exists: false, values: {} });
  assert.equal(await prisma.appSetting.count({ where: { key: "ui:navigation" } }), 0);
  await api.saveUiPreferences("navigation", { panelCollapsed: true, "project:tns": false });
  assert.deepEqual(await api.loadUiPreferences("navigation"), {
    exists: true, values: { panelCollapsed: true, "project:tns": false },
  });
});

test("동시에 서로 다른 설정을 변경해도 각 변경과 기존 설정을 보존한다", async () => {
  const api = await load();
  assert.equal(typeof api.saveUiPreferences, "function");
  await api.saveUiPreferences("navigation", { "project:common": true });
  await Promise.all([
    api.saveUiPreferences("navigation", { panelCollapsed: true }),
    api.saveUiPreferences("navigation", { "project:tns": false }),
  ]);
  assert.deepEqual((await api.loadUiPreferences("navigation")).values, {
    "project:common": true, panelCollapsed: true, "project:tns": false,
  });
});

test("로컬 설정 최초 이관은 기존 공유 설정을 덮어쓰지 않는다", async () => {
  const api = await load();
  assert.equal(typeof api.saveUiPreferences, "function");
  await Promise.all([
    api.saveUiPreferences("navigation", { panelCollapsed: true }, true),
    api.saveUiPreferences("navigation", { panelCollapsed: false }, true),
  ]);
  const before = await api.loadUiPreferences("navigation");
  assert.deepEqual(await api.saveUiPreferences("navigation", { "project:tns": true }, true), before);
});

test("표의 열 설정을 저장하고 잘못된 값이나 허용되지 않은 설정은 거절한다", async () => {
  const api = await load();
  assert.equal(typeof api.saveUiPreferences, "function");
  const values = { order: ["title", "status"], hidden: ["status"], "width:title": 220 };
  await api.saveUiPreferences("reference-columns", values);
  for (const invalid of [null, {}, { panelCollapsed: "false" }, { "project:tns": 1 }, { arbitrary: true }]) {
    await assert.rejects(() => api.saveUiPreferences("navigation", invalid));
  }
  for (const invalid of [{ order: [1] }, { hidden: ["x", "x"] }, { "width:title": -1 }, { "width:title": Infinity }]) {
    await assert.rejects(() => api.saveUiPreferences("reference-columns", invalid));
  }
  await assert.rejects(() => api.saveUiPreferences("erd:tns", { panelCollapsed: true }));
  assert.deepEqual((await api.loadUiPreferences("reference-columns")).values, values);
});
