import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "./test-db.mjs";
import { collectAi } from "./work-ai.ts";

test("AI projects follow nearest repository and explicit cwd mapping; unknown paths stay separate", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-ai-"));
  const id = "work-ai-project-fixture";
  const date = "2002-02-02";
  const time = new Date(`${date}T00:00:00Z`);
  try {
    await prisma.aiOpsDevice.deleteMany({ where: { id } });
    await prisma.aiOpsDevice.create({ data: { id, name: id, errors: 2, lastSyncAt: time } });
    const cwds = [join(root, "alpha", "src"), join(root, "alpha", "nested", "src"), join(root, "alphabet"), "/remote/work/beta", "(unknown)"];
    for (let i = 0; i < cwds.length; i++) {
      await prisma.aiOpsSession.create({ data: {
        id: `${id}-${i}`, deviceId: id, source: "CLAUDE_CODE", externalId: String(i),
        cwd: cwds[i], title: "설계 검토", startedAt: time, lastActiveAt: time,
        messages: { create: { id: `${id}-${i}`, role: "ASSISTANT", occurredAt: time, body: "분석 결과", chars: 5 } },
      } });
    }
    const projects = [{ key: "app:alpha", title: "Alpha" }, { key: "app:beta", title: "Beta" }];
    const repos = [
      { path: "alpha", projectKey: "app:alpha", status: "skipped", authorEmails: [] },
      { path: "alpha/nested", projectKey: "app:beta", status: "ok", authorEmails: [] },
    ];
    const out = await collectAi(date, root, projects, repos, { "/remote/work/beta": "beta" });
    assert.deepEqual(out.sources.map(s => s.projectKey), ["app:alpha", "app:beta", `ai-cwd:${cwds[2]}`, "app:beta", "ai-cwd:(unknown)"]);
    assert.equal(out.status.sessions, 5);
    assert.equal(out.status.devices.find(d => d.name === id).errors, 2);
    const empty = await collectAi("2002-02-03", root, projects, repos);
    assert.equal(empty.status.messages, 0);
    assert(empty.status.devices.some(d => d.name === id));
    await assert.rejects(() => collectAi(date, root, projects, repos, { "/remote/work/beta": "nonexistent" }), /매핑/);
  } finally {
    await prisma.aiOpsDevice.deleteMany({ where: { id } });
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
});
