#!/usr/bin/env node
import { lstat, mkdir, readlink, symlink, realpath, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillRoots = [join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills'), join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'skills')];
const links = [
  [join(root, 'scripts/pm-flow.mjs'), join(homedir(), '.local/bin/pm-flow')],
  ...skillRoots.flatMap(skillRoot => ['pm-flow-author', 'pm-flow-review'].map(name => [join(root, 'skills', name), join(skillRoot, name)])),
];
// 충돌은 설치 전에 모두 확인한다. 기존 사용자의 CLI나 스킬을 덮어쓰지 않는다.
for (const [source, target] of links) {
  try {
    const stat = await lstat(target);
    if (!stat.isSymbolicLink() || await realpath(target) !== await realpath(source)) throw new Error(`기존 설치와 충돌합니다: ${target}`);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
await chmod(join(root, 'scripts/pm-flow.mjs'), 0o755);
for (const [source, target] of links) {
  await mkdir(dirname(target), { recursive: true });
  try { await readlink(target); } catch (e) { if (e.code !== 'ENOENT') throw e; await symlink(source, target); }
  console.log(`${target} -> ${source}`);
}
console.log('Codex와 Claude Code의 새 세션에서 pm-flow-author / pm-flow-review를 사용하세요. CLI는 ~/.local/bin/pm-flow 입니다.');
