import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  appendFile,
  stat,
  rm,
  symlink,
  realpath,
  link,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discover } from "./discovery.mjs";
import { readChunk, collect } from "./collector.mjs";
const when = "2026-09-16T08:00:00Z";
const line = (type, payload) =>
  JSON.stringify({ timestamp: when, type, payload }) + "\n";
async function fileInfo(path) {
  const s = await stat(path);
  return {
    path,
    source: "CODEX",
    size: s.size,
    mtimeMs: s.mtimeMs,
    identity: `${s.dev}:${s.ino}`,
  };
}
test("private and project-local roots are found once despite aliases", async () => {
  const home = await mkdtemp(join(tmpdir(), "pm-ai-discovery-"));
  try {
    const privateRoot = join(home, ".uk-private/.codex/sessions"),
      projectRoot = join(home, "uk/project/.codex/sessions");
    for (const p of [privateRoot, projectRoot]) {
      await mkdir(p, { recursive: true });
      await writeFile(join(p, "a.jsonl"), "{}\n");
    }
    await mkdir(join(home, ".codex"), { recursive: true });
    await symlink(privateRoot, join(home, ".codex/sessions"));
    const result = await discover({ home, env: {} });
    assert.equal(result.files.length, 2);
    assert.equal(result.errors, 0);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test("Orca Codex homes and the private Claude config root are discovered without scanning auth data", async () => {
  const home = await mkdtemp(join(tmpdir(), "pm-ai-orca-discovery-"));
  try {
    const roots = [
      {
        source: "CODEX",
        path: join(
          home,
          "Library/Application Support/orca/codex-accounts/account-a/home/sessions",
        ),
      },
      {
        source: "CODEX",
        path: join(
          home,
          "Library/Application Support/orca/codex-accounts/account-a/home/archived_sessions",
        ),
      },
      {
        source: "CODEX",
        path: join(
          home,
          "Library/Application Support/orca/codex-runtime-home/home/sessions",
        ),
      },
      { source: "CLAUDE_CODE", path: join(home, ".uk-private/projects") },
    ];
    for (const [index, root] of roots.entries()) {
      await mkdir(root.path, { recursive: true });
      await writeFile(join(root.path, `${index}.jsonl`), "{}\n");
    }
    const auth = join(
      home,
      "Library/Application Support/orca/claude-accounts/account-a/auth",
    );
    await mkdir(auth, { recursive: true });
    await writeFile(join(auth, "credentials.jsonl"), "{}\n");

    const result = await discover({ home, workspace: join(home, "uk"), env: {} });
    const byPath = (a, b) => a.path.localeCompare(b.path);
    const expectedRoots = await Promise.all(
      roots.map(async ({ source, path }) => ({ source, path: await realpath(path) })),
    );
    assert.deepEqual(
      result.roots.map(({ source, path }) => ({ source, path })).sort(byPath),
      expectedRoots.sort(byPath),
    );
    assert.equal(result.files.length, roots.length);
    assert.ok(result.files.every((file) => !file.path.includes("claude-accounts")));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test("hard-linked session copies across Orca accounts are read once", async () => {
  const home = await mkdtemp(join(tmpdir(), "pm-ai-orca-hardlink-"));
  try {
    const first = join(
        home,
        "Library/Application Support/orca/codex-accounts/a/home/sessions/a.jsonl",
      ),
      second = join(
        home,
        "Library/Application Support/orca/codex-accounts/b/home/sessions/a.jsonl",
      );
    await mkdir(join(first, ".."), { recursive: true });
    await mkdir(join(second, ".."), { recursive: true });
    await writeFile(first, "{}\n");
    await link(first, second);

    const result = await discover({ home, workspace: join(home, "uk"), env: {} });
    assert.equal(result.files.length, 1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test("partial UTF8/JSON waits for newline; ACK failure preserves cursor and retry IDs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pm-ai-collect-"));
  try {
    const path = join(dir, "log.jsonl"),
      cwd = join(dir, "uk/project");
    const meta = line("session_meta", { id: "s", cwd });
    const msg = line("response_item", {
      type: "message",
      id: "m",
      role: "user",
      content: [{ type: "input_text", text: "한국어 질문" }],
    });
    await writeFile(path, meta + msg.slice(0, -3));
    const first = await readChunk(await fileInfo(path), undefined, {
      deviceId: "d",
      allowedCwd: join(dir, "uk"),
    });
    assert.equal(first.messages.length, 0);
    assert.equal(first.state.offset, Buffer.byteLength(meta));
    await appendFile(path, msg.slice(-3));
    const second = await readChunk(await fileInfo(path), first.state, {
      deviceId: "d",
      allowedCwd: join(dir, "uk"),
    });
    assert.equal(second.messages[0].body, "한국어 질문");
    const state = { version: 1, files: {} },
      config = {
        discovery: { files: [await fileInfo(path)], roots: [], errors: 0 },
        state,
        device: { id: "d", name: "mac" },
        allowedCwd: join(dir, "uk"),
        save: async () => {},
      };
    await assert.rejects(() =>
      collect({
        ...config,
        send: async () => {
          throw new Error("network");
        },
      }),
    );
    assert.deepEqual(state.files, {});
    const batches = [];
    await collect({ ...config, send: async (b) => batches.push(b) });
    assert.equal(batches[0].messages[0].id, second.messages[0].id);
    const next = [];
    await collect({ ...config, send: async (b) => next.push(b) });
    assert.equal(next.length, 1);
    assert.equal(next[0].messages.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("fresh replay and incremental startup produce identical message identifiers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pm-ai-replay-"));
  try {
    const path = join(dir, "log.jsonl"),
      context = { deviceId: "d", allowedCwd: join(dir, "uk") };
    await writeFile(
      path,
      line("session_meta", { id: "s", cwd: join(dir, "uk/p") }),
    );
    const first = await readChunk(await fileInfo(path), undefined, context);
    const event = line("event_msg", { type: "user_message", message: "hello" });
    await appendFile(path, event);
    const second = await readChunk(await fileInfo(path), first.state, context);
    await appendFile(
      path,
      line("response_item", {
        type: "message",
        id: "m",
        role: "user",
        content: "hello",
      }),
    );
    const third = await readChunk(await fileInfo(path), second.state, context);
    const replay = await readChunk(await fileInfo(path), undefined, context);
    assert.deepEqual(
      [...new Set([...second.messages, ...third.messages].map((m) => m.id))],
      [...new Set(replay.messages.map((m) => m.id))],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("large batches split below receiver limits without losing event identity", async () => {
  const { splitBatch } = await import("./collector.mjs");
  const messages = Array.from({ length: 1201 }, (_, i) => ({
    id: String(i),
    sessionId: "s",
    body: "한".repeat(2000),
  }));
  const b = {
    version: 1,
    device: { id: "d", name: "mac" },
    sessions: [{ id: "s" }],
    messages,
    usage: [],
    sync: { roots: [], files: 1, errors: 0 },
  };
  const parts = splitBatch(b);
  assert.ok(parts.length > 2);
  assert.deepEqual(
    parts.flatMap((p) => p.messages.map((m) => m.id)),
    messages.map((m) => m.id),
  );
  assert.ok(
    parts.every(
      (p) =>
        p.messages.length <= 500 &&
        Buffer.byteLength(JSON.stringify(p)) < 8 * 1024 * 1024,
    ),
  );
});
test("all-session scope replays legacy checkpoints once and preserves event IDs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pm-ai-scope-"));
  try {
    const path = join(dir, "log.jsonl");
    await writeFile(path,
      line("session_meta", { id: "outside", cwd: "/old/Documents/project" }) +
      line("response_item", { type: "message", id: "m", role: "user", content: "hello" }));
    const state = { version: 1, files: {} };
    const config = {
      discovery: { files: [await fileInfo(path)], roots: [], errors: 0 },
      state, device: { id: "d", name: "mac" }, save: async () => {},
    };
    const excluded = [];
    await collect({ ...config, allowedCwd: join(dir, "uk"), send: async b => excluded.push(...b.messages) });
    assert.equal(excluded.length, 0);
    delete state.scopeKey; // 기존 설치 버전의 체크포인트 형식
    const replayed = [];
    await collect({ ...config, allowedCwd: null, send: async b => replayed.push(...b.messages) });
    assert.equal(replayed.length, 1);
    const fresh = await readChunk(await fileInfo(path), undefined, { deviceId: "d", allowedCwd: null });
    assert.equal(replayed[0].id, fresh.messages[0].id);
    const unchanged = [];
    await collect({ ...config, allowedCwd: null, send: async b => unchanged.push(...b.messages) });
    assert.equal(unchanged.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("all-session scope retains valid sessions with missing cwd", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pm-ai-no-cwd-"));
  try {
    const path = join(dir, "log.jsonl");
    await writeFile(path,
      line("session_meta", { id: "unknown-cwd" }) +
      line("response_item", { type: "message", id: "m", role: "user", content: "hello" }));
    const result = await readChunk(await fileInfo(path), undefined, { deviceId: "d", allowedCwd: null });
    assert.equal(result.messages.length, 1);
    assert.equal(result.sessions[0].cwd, "(unknown)");
    assert.equal(result.errors, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
