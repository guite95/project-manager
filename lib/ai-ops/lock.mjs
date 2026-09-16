import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  const r = spawnSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8",
  });
  if (r.error) throw new Error("프로세스 상태 확인 실패");
  return r.status === 0 ? r.stdout.trim() || null : null;
}
/** 시작 시각까지 비교하여 PID 재사용을 구분한다. 해제는 같은 소유자만 가능하다. */
export async function acquireLock(
  path,
  { identity = processIdentity, now = Date.now, graceMs = 120000 } = {},
) {
  const owner = {
    pid: process.pid,
    start: identity(process.pid),
    token: randomUUID(),
  };
  if (!owner.start) throw new Error("수집 프로세스 식별 실패");
  async function claim() {
    try {
      await mkdir(path, { mode: 0o700 });
    } catch (e) {
      if (e.code === "EEXIST") return null;
      throw e;
    }
    await writeFile(join(path, "owner.json"), JSON.stringify(owner), {
      mode: 0o600,
      flag: "wx",
    });
    return async () => {
      try {
        const current = JSON.parse(
          await readFile(join(path, "owner.json"), "utf8"),
        );
        if (current.token === owner.token)
          await rm(path, { recursive: true, force: true });
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    };
  }
  // 복구자끼리 새 소유자의 디렉터리를 지우지 않도록 별도 잠금으로 직렬화한다.
  const recovery = `${path}.recovery`;
  try {
    await mkdir(recovery, { mode: 0o700 });
  } catch (e) {
    if (e.code === "EEXIST") {
      // 복구 도중 프로세스가 죽었으면 다음 실행에서 복구 잠금만 해제한다.
      const s = await stat(recovery).catch(() => null);
      if (s && now() - s.mtimeMs > graceMs)
        await rm(recovery, { recursive: true, force: true });
      return null;
    }
    throw e;
  }
  try {
    const first = await claim();
    if (first) return first;
    let current;
    try {
      current = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
      const s = await stat(path).catch(() => null);
      if (s && now() - s.mtimeMs <= graceMs) return null;
    }
    if (current?.start && identity(current.pid) === current.start) return null;
    await rm(path, { recursive: true, force: true });
    return await claim();
  } finally {
    await rm(recovery, { recursive: true, force: true });
  }
}
