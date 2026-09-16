#!/usr/bin/env node
import { homedir, hostname } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, rm, cp, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { discover } from "../lib/ai-ops/discovery.mjs";
import { atomicJson, loadState, collect } from "../lib/ai-ops/collector.mjs";
import { acquireLock } from "../lib/ai-ops/lock.mjs";
import { sshSettings, sendSsh } from "../lib/ai-ops/transport.mjs";

const home = homedir(),
  base = process.env.PM_AI_HOME || join(home, ".local/share/pm-ai-agent");
const configPath = join(base, "config.json"),
  statePath = join(base, "state.json"),
  statusPath = join(base, "status.json");
const label = "com.project-management.ai-agent",
  plist = join(home, "Library/LaunchAgents", `${label}.plist`);
const command = process.argv[2] ?? "help",
  args = process.argv.slice(3);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const xml = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
async function readConfig() {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT")
      throw new Error("먼저 pnpm ai:agent install로 설치하세요.");
    throw e;
  }
}
function launch(args, allowMissing = false) {
  const r = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (r.status !== 0 && !allowMissing)
    throw new Error("LaunchAgent 등록을 확인하세요.");
}
async function main() {
  if (command === "help") {
    console.log(
      "pm AI Agent: scan | install [--workspace PATH] [--ssh-config PATH] | sync | status | uninstall\nscan은 본문·비밀값을 출력하거나 전송하지 않습니다. 추가 로그 경로는 config.json extraRoots에 {source,path}로 지정합니다.",
    );
    return;
  }
  if (command === "status") {
    const c = await readConfig();
    let status;
    try {
      status = JSON.parse(await readFile(statusPath, "utf8"));
    } catch {
      status = { state: "NOT_SYNCED" };
    }
    const r = spawnSync(
      "/bin/launchctl",
      ["print", `gui/${process.getuid()}/${label}`],
      { stdio: "ignore" },
    );
    console.log(
      JSON.stringify(
        {
          installed: r.status === 0,
          workspace: c.workspace,
          intervalSeconds: 60,
          ...status,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "uninstall") {
    launch(["bootout", `gui/${process.getuid()}`, plist], true);
    await rm(plist, { force: true });
    console.log(
      "자동 수집을 해제했습니다. 기존 기록과 상태 파일은 보존합니다.",
    );
    return;
  }
  if (command === "install") {
    if (process.platform !== "darwin")
      throw new Error(
        "자동 실행 설치는 macOS LaunchAgent를 지원합니다. 다른 OS는 sync를 스케줄러에 등록하세요.",
      );
    const workspace = await realpath(option("--workspace", join(home, "uk")));
    const sshConfig = resolve(
      option("--ssh-config", join(home, ".config/oci-ssh/config.json")),
    );
    const settings = await sshSettings(sshConfig);
    // 배포된 intake를 확인하기 전 자동 실행을 등록하지 않는다.
    await sendSsh({ version: 1, probe: true }, settings);
    await mkdir(base, { recursive: true, mode: 0o700 });
    let old;
    try {
      old = await readConfig();
    } catch {}
    const config = {
      version: 1,
      device: old?.device ?? { id: randomUUID(), name: hostname() },
      workspace,
      sshConfig,
      extraRoots: old?.extraRoots ?? [],
      codexHome: process.env.CODEX_HOME ?? old?.codexHome,
      claudeConfigDir: process.env.CLAUDE_CONFIG_DIR ?? old?.claudeConfigDir,
    };
    const release = join(base, "releases", String(Date.now()));
    await mkdir(join(release, "scripts"), { recursive: true, mode: 0o700 });
    await mkdir(join(release, "lib"), { recursive: true, mode: 0o700 });
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    await cp(join(root, "lib/ai-ops"), join(release, "lib/ai-ops"), {
      recursive: true,
      filter: (p) => !p.endsWith(".test.mjs") && !p.endsWith("store.mjs"),
    });
    await cp(
      fileURLToPath(import.meta.url),
      join(release, "scripts/ai-ops-agent.mjs"),
    );
    await atomicJson(configPath, config);
    const node = await realpath(process.execPath);
    await mkdir(dirname(plist), { recursive: true });
    const content = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(join(release, "scripts/ai-ops-agent.mjs"))}</string><string>sync</string></array><key>RunAtLoad</key><true/><key>StartInterval</key><integer>60</integer><key>ProcessType</key><string>Background</string><key>EnvironmentVariables</key><dict><key>PM_AI_HOME</key><string>${xml(base)}</string></dict><key>StandardOutPath</key><string>${xml(join(base, "agent.log"))}</string><key>StandardErrorPath</key><string>${xml(join(base, "agent-error.log"))}</string></dict></plist>`;
    launch(["bootout", `gui/${process.getuid()}`, plist], true);
    await writeFile(plist, content, { mode: 0o600 });
    launch(["bootstrap", `gui/${process.getuid()}`, plist]);
    console.log(
      "자동 수집 등록 완료. 로그인 시와 60초 간격으로 실행합니다. pnpm ai:agent status로 확인하세요.",
    );
    return;
  }
  if (!["scan", "sync"].includes(command))
    throw new Error("지원하지 않는 명령입니다. help를 확인하세요.");
  const scan = command === "scan";
  const c = scan
    ? {
        workspace: resolve(option("--workspace", join(home, "uk"))),
        device: { id: "scan-only", name: hostname() },
        extraRoots: [],
      }
    : await readConfig();
  const settings = scan ? null : await sshSettings(c.sshConfig);
  let releaseLock;
  const signals = new Map();
  if (!scan) {
    await mkdir(base, { recursive: true, mode: 0o700 });
    releaseLock = await acquireLock(join(base, "sync.lock"));
    if (!releaseLock) return;
    for (const [signal, code] of [
      ["SIGTERM", 143],
      ["SIGINT", 130],
    ]) {
      const handler = () => {
        void releaseLock().finally(() => process.exit(code));
      };
      signals.set(signal, handler);
      process.once(signal, handler);
    }
  }
  try {
    const found = await discover({
      workspace: c.workspace,
      extraRoots: c.extraRoots,
      env: {
        ...process.env,
        CODEX_HOME: c.codexHome ?? process.env.CODEX_HOME,
        CLAUDE_CONFIG_DIR: c.claudeConfigDir ?? process.env.CLAUDE_CONFIG_DIR,
      },
    });
    const state = scan ? { version: 1, files: {} } : await loadState(statePath);
    const sessions = new Set();
    const counts = await collect({
      discovery: found,
      state,
      device: c.device,
      allowedCwd: c.workspace,
      send: scan
        ? async (b) => {
            for (const s of b.sessions) sessions.add(s.id);
          }
        : (b) => sendSsh(b, settings),
      save: scan ? async () => {} : (s) => atomicJson(statePath, s),
      maxChunks: Number(option("--max-chunks", "1000")),
    });
    const status = {
      state: counts.errors ? "PARTIAL" : counts.limited ? "SYNCING" : "SYNCED",
      lastSuccessAt: new Date().toISOString(),
      ...counts,
    };
    if (scan)
      console.log(
        JSON.stringify(
          {
            mode: "READ_ONLY",
            workspace: c.workspace,
            roots: found.roots,
            sessions: sessions.size,
            ...counts,
          },
          null,
          2,
        ),
      );
    else {
      await atomicJson(statusPath, status);
      console.log(JSON.stringify(status));
    }
  } catch (e) {
    if (!scan) {
      let old = {};
      try {
        old = JSON.parse(await readFile(statusPath, "utf8"));
      } catch {}
      await atomicJson(statusPath, {
        ...old,
        state: "ERROR",
        lastAttemptAt: new Date().toISOString(),
        error: "동기화 실패. SSH/배포/수집 경로를 확인하세요.",
      });
    }
    throw e;
  } finally {
    for (const [signal, handler] of signals)
      process.removeListener(signal, handler);
    if (releaseLock) await releaseLock();
  }
}
main().catch(() => {
  console.error(
    "AI Agent 실행 실패. 설치 여부, 수집 경로, 개인 SSH 연결과 서버 배포 상태를 확인하세요.",
  );
  process.exitCode = 1;
});
