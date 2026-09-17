import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { collectGit } from "./server/work-git.ts";
test("nested repositories, exact author, Seoul midnight, all branches and duplicate refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-git-"));
  try {
    const repo = join(root, "client", "alpha");
    await mkdir(repo, { recursive: true });
    const git = (args, env = {}) =>
      execFileSync("git", ["-C", repo, ...args], {
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      })
        .toString()
        .trim();
    git(["init"]);
    git(["config", "user.name", "Tester"]);
    git(["config", "user.email", "me@example.com"]);
    const commit = (title, date, email = "me@example.com") =>
      git(["commit", "--allow-empty", "-m", title], {
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
        GIT_AUTHOR_EMAIL: email,
      });
    commit("yesterday", "2026-09-13T14:59:59Z");
    commit("start", "2026-09-13T15:00:00Z");
    git(["branch", "duplicate"]);
    git(["checkout", "-b", "other"]);
    commit("other branch", "2026-09-14T01:00:00Z");
    commit("someone else", "2026-09-14T02:00:00Z", "other@example.com");
    commit("tomorrow", "2026-09-14T15:00:00Z");
    git(["checkout", "duplicate"]);
    const out = await collectGit(
      root,
      "2026-09-14",
      [{ key: "app:alpha", title: "Alpha" }],
      {},
    );
    assert.deepEqual(out.sources.map((s) => s.title).sort(), [
      "other branch",
      "start",
    ]);
    assert(out.sources.every((s) => s.projectKey === "app:alpha"));
    assert.equal(out.repositories.length, 1);
    assert.equal(out.repositories[0].status, "ok");
    const mapped = await collectGit(
      root,
      "2026-09-14",
      [{ key: "app:tns", title: "TNS" }],
      { "client/alpha": "tns" },
    );
    assert(mapped.sources.every((s) => s.projectKey === "app:tns"));
    await assert.rejects(() =>
      collectGit(root, "2026-09-14", [], { "client/alpha": "unknown" }),
    );
    const single = await collectGit(
      repo,
      "2026-09-14",
      [{ key: "app:alpha", title: "Alpha" }],
      { ".": "alpha" },
    );
    assert(single.sources.every((s) => s.projectKey === "app:alpha"));
    git(["worktree", "add", "--detach", join(root, "z-linked"), "other"]);
    const linked = await collectGit(
      root,
      "2026-09-14",
      [{ key: "app:tns", title: "TNS" }],
      { "z-linked": "tns" },
    );
    assert.equal(linked.sources.length, 2);
    assert(linked.sources.every((s) => s.projectKey === "app:tns"));
    assert(linked.repositories.every((r) => r.projectKey === "app:tns"));
    assert.equal(
      linked.repositories.filter((r) => r.status === "skipped").length,
      1,
    );
    await assert.rejects(() =>
      collectGit(
        root,
        "2026-09-14",
        [
          { key: "app:alpha", title: "Alpha" },
          { key: "app:tns", title: "TNS" },
        ],
        { "client/alpha": "alpha", "z-linked": "tns" },
      ),
    );
    await writeFile(join(root, "irrelevant.txt"), "not a repo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
