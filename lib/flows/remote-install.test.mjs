import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readlink, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFlowSshConfig } from './ssh-config.mjs';
const installer = resolve('scripts/install-flow-remote.mjs');

test('SSH config imports metadata only and honors explicit environment overrides', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-flow-config-'));
  try {
    const path = join(dir, 'ssh.env');
    await writeFile(path, 'SHARED_DB_SSH_HOST="host.example.com"\nSHARED_DB_SSH_USER=alice\nDATABASE_URL=not-allowed\nPM_FLOW_CHILD=1\n');
    assert.deepEqual(await readFlowSshConfig({ PM_FLOW_SSH_CONFIG: path, SHARED_DB_SSH_USER: 'bob' }), { SHARED_DB_SSH_HOST: 'host.example.com' });
    await assert.rejects(() => readFlowSshConfig({ PM_FLOW_SSH_CONFIG: join(dir, 'missing') }), /설정 파일/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('remote installer downloads a pinned commit, preserves config, updates and rolls back without overwriting user files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pm-flow-install-'));
  const repo = join(dir, 'source'), home = join(dir, 'install'), skills = join(dir, 'skills');
  function git(args) {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  }
  try {
    await mkdir(join(repo, 'scripts'), { recursive: true });
    for (const name of ['pm-flow-author','pm-flow-review']) {
      await mkdir(join(repo, 'skills', name), { recursive: true });
      await writeFile(join(repo, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
    }
    await writeFile(join(repo, 'scripts/pm-flow.mjs'), "console.log('test-cli');\n");
    git(['init', '-q']); git(['add', '.']); git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture']);
    const first = git(['rev-parse', 'HEAD']);
    const pnpm = join(dir, 'pnpm-fixture');
    // 다운로드·버전 전환은 실제 Git으로 검사하고 패키지 설치만 대체한다.
    await writeFile(pnpm, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const env = { ...process.env, PM_FLOW_INSTALL_HOME: home, PM_FLOW_SKILLS_DIR: skills, PM_FLOW_CLAUDE_SKILLS_DIR: join(dir, 'claude-skills'), PM_FLOW_REPOSITORY: repo, PM_FLOW_PNPM: pnpm };
    const install = ref => spawnSync(process.execPath, [installer, '--ref', ref], { env, encoding: 'utf8' });
    let r = install(first); assert.equal(r.status, 0, r.stderr);
    const current = join(home, '.local/share/pm-flow/current');
    assert.equal(await readlink(current), join(home, '.local/share/pm-flow/releases', first));
    for (const name of ['pm-flow-author','pm-flow-review']) {
      assert.equal(await readlink(join(skills, name)), join(home, '.local/share/pm-flow/current/skills', name));
      assert.equal(await readlink(join(dir, 'claude-skills', name)), join(home, '.local/share/pm-flow/current/skills', name));
    }
    const config = join(home, '.config/pm-flow/ssh.env'); await writeFile(config, 'SHARED_DB_SSH_USER=preserved\n');
    await writeFile(join(repo, 'scripts/pm-flow.mjs'), "console.log('version-two');\n");
    git(['add','.']); git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','second']);
    const second = git(['rev-parse','HEAD']);
    r = install(second); assert.equal(r.status, 0, r.stderr);
    assert.ok((await readlink(current)).endsWith(second));
    assert.equal(await readFile(config,'utf8'), 'SHARED_DB_SSH_USER=preserved\n');
    r = install('nonexistent-ref'); assert.notEqual(r.status, 0);
    assert.ok((await readlink(current)).endsWith(second));
    r = install(first); assert.equal(r.status, 0, r.stderr); assert.ok((await readlink(current)).endsWith(first));
    const executable = join(home, '.local/bin/pm-flow');
    assert.ok((await lstat(executable)).isSymbolicLink());
    await rm(executable); await writeFile(executable,'user-owned');
    r = install(second); assert.notEqual(r.status, 0);
    assert.equal(await readFile(executable,'utf8'), 'user-owned');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
