import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rm, rmdir, statfs } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSecretReader } from '../../lib/server/runtime-secrets.mjs';

const secretRoot = '/run/oci-service-secrets/project-management-migration';
export function migrationContainerArgs(image, name) {
  if (!/^project-management:[a-f0-9]{40}$/.test(image ?? '') || !/^pm-migration-[a-z0-9-]+$/.test(name ?? '')) throw new Error('PM_MIGRATION_ARGUMENTS');
  return ['run', '--rm', '--name', name, '--pull', 'never', '--network', 'shared-infra',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '128', '--memory', '512m', '--cpus', '1', '--log-driver', 'none',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
    '--mount', `type=bind,src=${secretRoot},dst=/run/project-management-migration,readonly`,
    '--env', 'PM_MIGRATION_SECRET_DIRECTORY=/run/project-management-migration',
    '--env', 'JITI_FS_CACHE=0', '--entrypoint', 'node_modules/.bin/prisma', image, 'migrate', 'deploy'];
}

function run(file, args, timeout = 30000) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error('PM_MIGRATION_FAILED');
  return result.stdout;
}
async function main() {
  const image = process.argv[2], name = `pm-migration-${randomUUID()}`;
  const args = migrationContainerArgs(image, name);
  if (process.getuid() !== 0 || process.argv.length !== 3 || (await statfs('/run')).type !== 0x01021994) throw new Error();
  const lock = '/run/pm-vault-migration.lock';
  let locked = false, ownsContainer = false, ownsSecrets = false;
  try {
    await mkdir(lock, { mode: 0o700 }); locked = true;
    const existing = spawnSync('/usr/bin/docker', ['container', 'inspect', name], { encoding: 'utf8', timeout: 30000 });
    if (existing.status !== 1 || existing.stdout?.trim() !== '[]') throw new Error();
    const prior = await lstat(secretRoot).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (prior) throw new Error(); // A previous incomplete operation needs inspection.
    run('/usr/bin/docker', ['image', 'inspect', image]);
    run('/usr/bin/python3', ['/opt/project-management-runtime/current/ops/oci-runtime/imds-guard.py', '--check']);
    // Preserve a verified custom-format backup before any schema write.
    run('/bin/bash', ['/opt/project-management-runtime/current/ops/oci-runtime/backup-pm-db.sh'], 210000);
    // Root child stdout/stderr is captured and discarded, including identity SDK logs.
    ownsSecrets = true;
    run('/opt/node24/bin/node', ['/opt/project-management-runtime/current/ops/oci-runtime/vault-runtime.mjs', '--migration'], 180000);
    const read = createSecretReader({ directory: secretRoot, profile: 'migration' });
    const url = new URL(read('DATABASE_URL'));
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || decodeURIComponent(url.pathname) !== '/project_management') throw new Error();
    ownsContainer = true;
    run('/usr/bin/docker', args, 180000);
  } finally {
    // Exact operation-owned targets only. The user's retained input file is never involved.
    if (ownsContainer) {
      spawnSync('/usr/bin/docker', ['rm', '-f', name], { stdio: 'pipe', timeout: 30000 });
      const remaining = spawnSync('/usr/bin/docker', ['container', 'inspect', name], { encoding: 'utf8', timeout: 30000 });
      // A daemon failure is not proof of removal. Keep the lock/secrets for inspection.
      if (remaining.status !== 1 || remaining.stdout?.trim() !== '[]') throw new Error();
    }
    if (ownsSecrets) {
      const stat = await lstat(secretRoot).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (stat) {
        if (!stat.isDirectory() || stat.uid !== 0 || stat.gid !== 0 || (stat.mode & 0o777) !== 0o750) throw new Error();
        await rm(secretRoot, { recursive: true });
      }
    }
    if (locked) await rmdir(lock);
  }
  process.stdout.write('PM_MIGRATION_SUCCEEDED\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('PM_MIGRATION_FAILED\n'); process.exitCode = 1; });
}
