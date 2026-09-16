import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock } from "./lock.mjs";
test("lock excludes concurrent collector, recovers reused PID, and preserves new owner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pm-ai-lock-")),
    path = join(dir, "lock");
  try {
    const release = await acquireLock(path, {
      identity: () => "start-current",
    });
    assert.equal(
      await acquireLock(path, { identity: () => "start-current" }),
      null,
    );
    await release();
    await mkdir(path);
    await writeFile(
      join(path, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        start: "start-previous",
        token: "previous",
      }),
    );
    const recovered = await acquireLock(path, {
      identity: () => "start-current",
    });
    assert.equal(typeof recovered, "function");
    await release();
    assert.equal(
      await acquireLock(path, { identity: () => "start-current" }),
      null,
    );
    await recovered();
    await mkdir(path);
    assert.equal(
      await acquireLock(path, { identity: () => "start-current" }),
      null,
    );
    const orphan = await acquireLock(path, {
      identity: () => "start-current",
      now: () => Date.now() + 200000,
    });
    assert.equal(typeof orphan, "function");
    await orphan();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("initial acquisition and recovery cannot overlap under concurrent contention", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pm-ai-lock-race-")),
    path = join(dir, "lock");
  let active = 0,
    overlap = 0,
    acquired = 0;
  try {
    await Promise.all(
      Array.from({ length: 12 }, async () => {
        for (let i = 0; i < 150; i++) {
          const release = await acquireLock(path, {
            identity: () => "current",
          });
          if (!release) continue;
          acquired++;
          active++;
          if (active > 1) overlap++;
          await new Promise((r) => setTimeout(r, 1));
          active--;
          await release();
        }
      }),
    );
    assert.ok(acquired > 0);
    assert.equal(overlap, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
