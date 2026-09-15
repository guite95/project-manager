#!/usr/bin/env node
import { lstat, mkdir, realpath, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = await realpath(fileURLToPath(new URL("..", import.meta.url)));
const targets = [".agents", ".claude"].map((runtime) =>
  resolve(homedir(), runtime, "skills", "work-sum"),
);
try {
  // 두 설치 위치를 모두 검사한 뒤 새 링크만 만든다. 기존 항목은 교체하지 않는다.
  const missing = [];
  for (const target of targets) {
    const entry = await lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!entry) missing.push(target);
    else if (!entry.isSymbolicLink() || (await realpath(target)) !== source)
      throw new Error(`기존 스킬과 경로가 다릅니다: ${target}`);
  }
  for (const target of missing) {
    await mkdir(dirname(target), { recursive: true });
    await symlink(source, target, "dir");
  }
  for (const target of targets) {
    if ((await realpath(target)) !== source)
      throw new Error(`설치 경로 확인 실패: ${target}`);
  }
  console.log(JSON.stringify({ status: "installed", source, targets }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
