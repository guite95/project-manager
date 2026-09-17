import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "./server/test-db.mjs";
const script = resolve("skills/work-sum/scripts/work.mjs");
test("CLI collects, validates and saves real Git + completion evidence; hash and revision protect writes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "work-cli-"));
  const root = join(temp, "repos");
  const repo = join(root, "alpha");
  const date = "1999-12-31";
  const id = "work-sum-cli-fixture";
  const key = `work-summary:${date}`;
  const run = (args) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: temp,
      encoding: "utf8",
      env: process.env,
    });
  try {
    await mkdir(repo, { recursive: true });
    const git = (args) =>
      execFileSync("git", ["-C", repo, ...args], {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: `${date}T01:00:00Z`,
          GIT_COMMITTER_DATE: `${date}T01:00:00Z`,
        },
        stdio: "pipe",
      });
    git(["init"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "me@example.com"]);
    git(["commit", "--allow-empty", "-m", "로그인 검증 추가"]);
    await prisma.appSetting.deleteMany({ where: { key } });
    await prisma.completion.deleteMany({ where: { id } });
    await prisma.completion.create({
      data: {
        id,
        projectSlug: "common",
        title: "고객 일정 협의",
        completedOn: date,
        completedAt: new Date(`${date}T01:00:00Z`),
      },
    });
    await prisma.aiOpsDevice.deleteMany({ where: { id } });
    await prisma.aiOpsDevice.create({ data: { id, name: "work-sum test" } });
    await prisma.aiOpsSession.create({ data: {
      id, deviceId: id, source: "CODEX", externalId: id, cwd: repo,
      title: "권한 검증", startedAt: new Date("1999-12-29T00:00:00Z"),
      lastActiveAt: new Date("2000-01-01T00:00:00Z"),
    } });
    await prisma.aiOpsMessage.createMany({ data: [
      { id: `${id}-before`, occurredAt: new Date("1999-12-30T14:59:59Z"), role: "USER", body: "전날 요청" },
      { id: `${id}-start`, occurredAt: new Date("1999-12-30T15:00:00Z"), role: "USER", body: "검증을 추가해줘" },
      { id: `${id}-answer`, occurredAt: new Date("1999-12-31T14:59:59Z"), role: "ASSISTANT", body: "검증 구현. 테스트 실패. api_key=should-not-leak-to-evidence" },
      { id: `${id}-missing`, occurredAt: new Date("1999-12-31T01:00:00Z"), role: "ASSISTANT", body: null },
      { id: `${id}-end`, occurredAt: new Date("1999-12-31T15:00:00Z"), role: "USER", body: "다음날 요청" },
    ].map(m => ({ ...m, sessionId: id, chars: m.body?.length ?? 0 })) });
    const evidence = join(temp, "evidence.json"),
      draft = join(temp, "draft.json");
    const collected = run([
      "collect",
      "--root",
      root,
      "--date",
      date,
      "--output",
      evidence,
    ]);
    assert.equal(collected.status, 0, collected.stderr);
    const e = JSON.parse(await readFile(evidence, "utf8"));
    assert.equal(e.sources.length, 5);
    assert.equal(e.target, "test");
    const ai = e.sources.filter(s => s.kind === "ai");
    assert.equal(ai.length, 3);
    assert(ai.every(s => s.projectKey === "repo:alpha"));
    assert.equal(e.ai.messages, 3);
    assert.equal(e.ai.missingBodies, 1);
    const transcriptPath = JSON.parse(collected.stdout).aiTranscript;
    const transcript = JSON.parse(await readFile(transcriptPath, "utf8"));
    assert.equal(transcript.messages.length, 3);
    assert.equal((await stat(transcriptPath)).mode & 0o777, 0o600);
    assert(!JSON.stringify(transcript).includes("should-not-leak"));
    assert(!JSON.stringify(e).includes("검증 구현"));
    assert(!JSON.stringify(transcript).includes("전날 요청"));
    assert(!JSON.stringify(transcript).includes("다음날 요청"));
    await writeFile(
      draft,
      JSON.stringify({
        items: e.sources.map((s) => ({
          projectKey: s.projectKey,
          title: s.title,
          sourceIds: [s.id],
        })),
        excluded: [],
      }),
    );
    const args = ["--evidence", evidence, "--file", draft];
    const valid = run(["validate", ...args]);
    assert.equal(valid.status, 0, valid.stderr);
    const hash = JSON.parse(valid.stdout).sha256;
    const bad = run([
      "save",
      ...args,
      "--sha256",
      "wrong",
      "--backup-dir",
      join(temp, "backups"),
    ]);
    assert.notEqual(bad.status, 0);
    assert.equal(await prisma.appSetting.count({ where: { key } }), 0);
    const saved = run([
      "save",
      ...args,
      "--sha256",
      hash,
      "--backup-dir",
      join(temp, "backups"),
    ]);
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal(JSON.parse(saved.stdout).revision, 1);
    const stored = await prisma.appSetting.findUnique({ where: { key } });
    assert.equal(stored.value.evidence.sources.filter(s => s.kind === "ai").length, 3);
    assert(!JSON.stringify(stored.value).includes("검증 구현"));
    const stale = run([
      "save",
      ...args,
      "--sha256",
      hash,
      "--backup-dir",
      join(temp, "backups"),
    ]);
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /버전/);
    assert.equal(await prisma.completion.count({ where: { id } }), 1);
  } finally {
    await prisma.appSetting.deleteMany({ where: { key } });
    await prisma.completion.deleteMany({ where: { id } });
    await prisma.aiOpsDevice.deleteMany({ where: { id } });
    await prisma.$disconnect();
    await rm(temp, { recursive: true, force: true });
  }
});
