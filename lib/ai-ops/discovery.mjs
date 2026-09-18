import { readdir, realpath, stat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { homedir } from "node:os";
const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  ".cache",
  "dist",
  "build",
  ".venv",
  "venv",
  ".turbo",
]);
export async function discover({
  home = homedir(),
  workspace = join(home, "uk"),
  extraRoots = [],
  env = process.env,
} = {}) {
  const candidates = [];
  let errors = 0;
  const codex = (path) => {
    candidates.push(
      { source: "CODEX", path: join(path, "sessions") },
      { source: "CODEX", path: join(path, "archived_sessions") },
    );
  };
  const claude = (path) =>
    candidates.push({ source: "CLAUDE_CODE", path: join(path, "projects") });
  codex(join(home, ".codex"));
  codex(join(home, ".uk-private/.codex"));
  claude(join(home, ".claude"));
  claude(join(home, ".uk-private/.claude"));
  // CLAUDE_CONFIG_DIR=~/.uk-private로 실행한 기존 세션도 보존한다.
  claude(join(home, ".uk-private"));
  if (env.CODEX_HOME) codex(resolve(env.CODEX_HOME));
  if (env.CLAUDE_CONFIG_DIR) claude(resolve(env.CLAUDE_CONFIG_DIR));
  // Orca는 계정별 Codex 홈을 Library/Application Support 아래에 격리한다.
  // 인증·상태 폴더 전체가 아니라 대화 세션 폴더만 후보에 추가한다.
  const orca = join(home, "Library/Application Support/orca");
  try {
    const accounts = await readdir(join(orca, "codex-accounts"), {
      withFileTypes: true,
    });
    for (const account of accounts) {
      if (account.isDirectory())
        codex(join(orca, "codex-accounts", account.name, "home"));
    }
  } catch (e) {
    if (e.code !== "ENOENT") errors++;
  }
  codex(join(orca, "codex-runtime-home/home"));
  const visited = new Set();
  async function findHomes(path) {
    let actual;
    try {
      actual = await realpath(path);
    } catch (e) {
      if (e.code !== "ENOENT") errors++;
      return;
    }
    if (visited.has(actual)) return;
    visited.add(actual);
    let entries;
    try {
      entries = await readdir(actual, { withFileTypes: true });
    } catch {
      errors++;
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = join(actual, e.name);
      if (e.name === ".codex") {
        codex(p);
        continue;
      }
      if (e.name === ".claude") {
        claude(p);
        continue;
      }
      // 커스텀 CODEX_HOME도 sessions 하위에서 식별한다. 본문 파일은 파서가 검증한다.
      if (["sessions", "archived_sessions"].includes(e.name)) {
        candidates.push({ source: "CODEX", path: p });
        continue;
      }
      if (e.isDirectory() || e.isSymbolicLink()) {
        try {
          if ((await stat(p)).isDirectory()) await findHomes(p);
        } catch {
          errors++;
        }
      }
    }
  }
  await findHomes(workspace);
  for (const r of extraRoots) {
    if (
      !["CODEX", "CLAUDE_CODE"].includes(r.source) ||
      typeof r.path !== "string"
    )
      throw new Error("추가 로그 경로 형식이 올바르지 않습니다.");
    candidates.push({
      source: r.source,
      path: resolve(r.path.replace(/^~(?=\/|$)/, home)),
    });
  }
  const seenDirs = new Set(),
    seenFiles = new Set(),
    seenIdentities = new Set(),
    files = [],
    roots = [];
  async function walk(path, source) {
    let actual;
    try {
      actual = await realpath(path);
    } catch (e) {
      if (e.code !== "ENOENT") errors++;
      return;
    }
    if (seenDirs.has(actual)) return;
    seenDirs.add(actual);
    let entries;
    try {
      entries = await readdir(actual, { withFileTypes: true });
    } catch {
      errors++;
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = join(actual, e.name);
      if (e.isDirectory()) await walk(p, source);
      else if (e.isFile() || e.isSymbolicLink()) {
        try {
          const full = await realpath(p),
            s = await stat(full);
          if (s.isDirectory()) {
            await walk(full, source);
            continue;
          }
          const identity = `${s.dev}:${s.ino}`;
          if (
            basename(full).endsWith(".jsonl") &&
            !seenFiles.has(full) &&
            !seenIdentities.has(identity)
          ) {
            seenFiles.add(full);
            seenIdentities.add(identity);
            files.push({
              path: full,
              source,
              size: s.size,
              mtimeMs: s.mtimeMs,
              identity,
            });
          }
        } catch {
          errors++;
        }
      }
    }
  }
  for (const r of candidates) {
    try {
      const path = await realpath(r.path);
      if (!roots.some((x) => x.path === path)) {
        const before = files.length;
        await walk(path, r.source);
        if (files.length > before) roots.push({ source: r.source, path });
      }
    } catch (e) {
      if (e.code !== "ENOENT") errors++;
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  return { files, roots, errors };
}
