import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
export async function sshSettings(
  path = join(homedir(), ".config/oci-ssh/config.json"),
) {
  const s = JSON.parse(await readFile(path, "utf8"));
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(s.host) ||
    !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s.user) ||
    !Number.isInteger(Number(s.port)) ||
    Number(s.port) < 1 ||
    Number(s.port) > 65535 ||
    typeof s.identity_file !== "string"
  )
    throw new Error("개인 SSH 설정을 확인하세요.");
  return s;
}
export async function sendSsh(batch, settings) {
  const content = JSON.stringify(batch);
  if (Buffer.byteLength(content) > 8 * 1024 * 1024)
    throw new Error("전송 묶음이 최대 크기를 초과했습니다.");
  const args = [
    "-T",
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    "-i",
    settings.identity_file.replace(/^~(?=\/|$)/, homedir()),
    "-p",
    String(settings.port),
    `${settings.user}@${settings.host}`,
    "docker exec -i project-management node scripts/ai-ops-ingest.mjs",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/ssh", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    const cleanup = () => {
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", stop);
    };
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 90_000);
    child.stdout.on("data", (d) => {
      if (out.length < 65536) out += d.toString();
    });
    child.stderr.resume(); // 원격 오류에는 비밀값이 포함될 수 있으므로 기록하지 않는다.
    child.on("error", () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error("SSH 실행 실패. 개인 SSH 설정을 확인하세요."));
    });
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      clearTimeout(timer);
      cleanup();
      try {
        const ack = JSON.parse(out);
        if (code !== 0 || ack.ok !== true) throw new Error();
        resolve(ack);
      } catch {
        reject(
          new Error(
            "서버 수신 확인 실패. 배포 상태와 SSH 연결을 확인하세요. 수집 위치는 유지됩니다.",
          ),
        );
      }
    });
    child.stdin.end(content);
  });
}
