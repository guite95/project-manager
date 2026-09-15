import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "./test-db.mjs";
import { loadWorkSummary, saveWorkSummary } from "./work-summary-store.ts";
const evidence = {
  version: 1,
  date: "1901-01-01",
  timezone: "Asia/Seoul",
  collectedAt: "2026-09-14T00:00:00Z",
  expectedRevision: 0,
  target: "test",
  projects: [{ key: "app:test", title: "Test" }],
  repositories: [],
  sources: [
    {
      id: "c:test",
      kind: "completion",
      projectKey: "app:test",
      title: "일정 협의",
      completionId: "test",
      completedAt: "1901-01-01T00:00:00Z",
    },
  ],
};
const draft = {
  items: [
    { projectKey: "app:test", title: "고객 일정 협의", sourceIds: ["c:test"] },
  ],
  excluded: [],
};
test("save with backup, reject stale revision, and preserve original completions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "work-summary-store-"));
  const key = "work-summary:1901-01-01";
  try {
    await prisma.appSetting.deleteMany({ where: { key } });
    const before = await prisma.completion.count();
    const first = await saveWorkSummary(evidence, draft, directory);
    assert.equal(first.revision, 1);
    await assert.rejects(
      () => saveWorkSummary(evidence, draft, directory),
      /버전/,
    );
    const races = await Promise.allSettled([
      saveWorkSummary({ ...evidence, expectedRevision: 1 }, draft, directory),
      saveWorkSummary({ ...evidence, expectedRevision: 1 }, draft, directory),
    ]);
    assert.equal(races.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal((await loadWorkSummary(evidence.date)).revision, 2);
    assert.equal(await prisma.completion.count(), before);
    const backups = await readdir(directory);
    assert(backups.length >= 2);
    assert(backups.some((name) => name.endsWith(".json")));
    const raw = JSON.parse(await readFile(join(directory, backups[0]), "utf8"));
    assert.equal(raw.key, key);
  } finally {
    await prisma.appSetting.deleteMany({ where: { key } });
    await rm(directory, { recursive: true, force: true });
    await prisma.$disconnect();
  }
});
