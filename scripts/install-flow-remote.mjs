#!/usr/bin/env node
/** 개인 SSH 권한을 사용하는 원격 소스 설치. 비밀번호·개인키는 배포하지 않는다. */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, lstat, readlink, symlink, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node install-flow-remote.mjs [--ref main|tag|commit]\nNode 22.12 이상, Git, pnpm이 필요합니다.\n설치: ~/.local/share/pm-flow/releases/<commit>\n명령: ~/.local/bin/pm-flow\n설정: ~/.config/pm-flow/ssh.env\n같은 명령을 다시 실행하면 지정한 버전으로 업데이트합니다. 기존 버전은 보관합니다.`);
  process.exit(0);
}
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const ref = option('--ref') ?? 'main';
if (args.some((v, i) => i % 2 === 0 ? v !== '--ref' : !v) || args.length % 2 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ref) || ref.includes('..')) throw new Error('사용법: --ref main|tag|commit');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || major === 22 && minor < 12) throw new Error('Node 22.12 이상이 필요합니다.');
const repo = process.env.PM_FLOW_REPOSITORY || 'https://github.com/guite95/project-manager.git';
const pnpm = process.env.PM_FLOW_PNPM || 'pnpm';
const home = process.env.PM_FLOW_INSTALL_HOME || homedir();
const store = join(home, '.local/share/pm-flow');
const config = join(home, '.config/pm-flow/ssh.env');
const skillRoots = [
  process.env.PM_FLOW_SKILLS_DIR || join(process.env.CODEX_HOME || join(home, '.codex'), 'skills'),
  process.env.PM_FLOW_CLAUDE_SKILLS_DIR || join(process.env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'skills'),
];
const skillNames = ['pm-flow-author', 'pm-flow-review'];
function run(command, argv, cwd, extraEnv = {}) {
  const result = spawnSync(command, argv, { cwd, env: { ...process.env, ...extraEnv }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(`${command} 실행 실패. 설치 권한·네트워크·도구 버전을 확인하세요. 기존 설치는 유지됩니다.`);
  return result.stdout.trim();
}
async function exists(path) { try { await lstat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
const destinations = [join(home, '.local/bin/pm-flow'), ...skillRoots.flatMap(skillRoot => skillNames.map(n => join(skillRoot, n)))];
await mkdir(join(store, 'releases'), { recursive: true, mode: 0o700 });
// 중복 설치가 같은 심볼릭 링크를 교체하지 않도록 잠근다.
const lock = join(store, '.install-lock');
try { await mkdir(lock); } catch { throw new Error(`다른 설치가 진행 중입니다. 중단된 설치라면 확인 후 ${lock}를 제거하세요.`); }
let staging;
const createdLinks = [];
try {
  for (const destination of destinations) {
    if (await exists(destination)) {
      const stat = await lstat(destination);
      if (!stat.isSymbolicLink()) throw new Error(`기존 파일을 덮어쓰지 않습니다: ${destination}`);
      const target = resolve(dirname(destination), await readlink(destination));
      if (target !== (destination === destinations[0] ? join(store, 'current/scripts/pm-flow.mjs') : join(store, 'current/skills', destination.split('/').at(-1)))) {
        throw new Error(`기존 개발용 연결이 있습니다: ${destination}. 연결 대상을 확인한 뒤 해당 심볼릭 링크만 제거하고 다시 설치하세요.`);
      }
    }
  }
  if (await exists(join(store, 'current')) && !(await lstat(join(store, 'current'))).isSymbolicLink()) throw new Error('current 경로에 기존 파일/폴더가 있습니다.');
  staging = await mkdtemp(join(store, '.download-'));
  run('git', ['init', '--quiet', staging]);
  run('git', ['remote', 'add', 'origin', repo], staging);
  run('git', ['fetch', '--quiet', '--depth', '1', 'origin', ref], staging);
  run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], staging);
  const commit = run('git', ['rev-parse', 'HEAD'], staging);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('다운로드한 커밋 식별자가 올바르지 않습니다.');
  // 아직 CLI가 게시되지 않은 revision은 설치하지 않는다.
  await readFile(join(staging, 'scripts/pm-flow.mjs'));
  const release = join(store, 'releases', commit);
  if (!await exists(release)) {
    console.log(`CLI ${commit.slice(0, 12)} 의존성을 설치합니다…`);
    run(pnpm, ['install', '--frozen-lockfile'], staging);
    run(pnpm, ['exec', 'prisma', 'generate'], staging, { DATABASE_URL: 'postgresql://unused@localhost:5432/unused' });
    run(process.execPath, ['--experimental-strip-types', 'scripts/pm-flow.mjs', 'help'], staging);
    const { chmod } = await import('node:fs/promises');
    await chmod(join(staging, 'scripts/pm-flow.mjs'), 0o755);
    await rename(staging, release); staging = undefined;
  }
  run(process.execPath, ['--experimental-strip-types', 'scripts/pm-flow.mjs', 'help'], release);
  for (const name of ['pm-flow-author','pm-flow-review']) await readFile(join(release, 'skills', name, 'SKILL.md'));
  await mkdir(dirname(config), { recursive: true, mode: 0o700 });
  if (!await exists(config)) await writeFile(config, `# 개인 SSH 접속 메타데이터만 입력하세요. 서버 DB 비밀번호는 넣지 않습니다.\nSHARED_DB_SSH_HOST=your-server.example.com\nSHARED_DB_SSH_USER=your-user\nSHARED_DB_SSH_PORT=61185\nSHARED_DB_SSH_KEY=~/.ssh/your-personal-key\nSHARED_DB_REMOTE_PORT=15432\n`, { flag: 'wx', mode: 0o600 });
  // 모든 실행 진입점은 current를 경유한다. 한 번의 rename으로 버전을 전환한다.
  const sources = [join(store, 'current/scripts/pm-flow.mjs'), ...skillRoots.flatMap(() => skillNames.map(n => join(store, 'current/skills', n)))];
  for (let i = 0; i < destinations.length; i++) {
    await mkdir(dirname(destinations[i]), { recursive: true });
    if (!await exists(destinations[i])) { await symlink(sources[i], destinations[i]); createdLinks.push(destinations[i]); }
  }
  const pending = join(store, `.current-${randomUUID()}`);
  await symlink(release, pending);
  await rename(pending, join(store, 'current'));
  console.log(`설치 완료: ${commit}\n명령: ~/.local/bin/pm-flow\n개인 SSH 설정: ${config}\n스킬은 Codex와 Claude Code의 새 세션에서 사용할 수 있습니다.`);
} catch (error) {
  for (const link of createdLinks) await rm(link);
  console.error(error.code === 'ENOENT' ? '선택한 원격 버전에 CLI 파일이 없거나 필요한 도구가 없습니다. 게시된 버전을 확인하세요.' : error.message);
  process.exitCode = 1;
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
  await rm(lock, { recursive: true, force: true });
}
