import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rm, rmdir, statfs } from 'node:fs/promises';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import { readServiceFile } from './service-readiness.mjs';

const secretRoot = '/run/oci-service-secrets/flight-migration';
export function flightMigrationArgs(image, name) {
  if (!/^ghcr\.io\/adogs-flights\/flight-backend:[a-f0-9]{40}$/.test(image ?? '') || !/^flight-migration-[a-z0-9-]+$/.test(name ?? '')) throw new Error('FLIGHT_MIGRATION_ARGUMENTS');
  return ['run', '--rm', '--name', name, '--pull', 'never', '--network', 'shared-infra',
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '128', '--memory', '512m', '--cpus', '1', '--log-driver', 'none', '--ulimit', 'core=0',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
    '--mount', `type=bind,src=${secretRoot},dst=${secretRoot},readonly`,
    '--env', `FLIGHT_MIGRATION_SECRET_DIRECTORY=${secretRoot}`, '--env', 'PYTHONDONTWRITEBYTECODE=1',
    '--entrypoint', 'alembic', image, 'upgrade', 'head'];
}
function run(file, args, timeout = 30000) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error('FLIGHT_MIGRATION_FAILED');
  return result.stdout;
}
async function main() {
  const image = process.argv[2], name = `flight-migration-${randomUUID()}`;
  const args = flightMigrationArgs(image, name);
  if (process.getuid() !== 0 || process.argv.length !== 3 || (await statfs('/run')).type !== 0x01021994) throw new Error();
  const lock = '/run/flight-vault-migration.lock';
  let locked = false, ownsContainer = false, ownsSecrets = false;
  try {
    await mkdir(lock, { mode: 0o700 }); locked = true;
    const existing = spawnSync('/usr/bin/docker', ['container', 'inspect', name], { encoding: 'utf8', timeout: 30000 });
    if (existing.status !== 1 || existing.stdout?.trim() !== '[]') throw new Error();
    if (await lstat(secretRoot).catch(error => { if (error.code !== 'ENOENT') throw error; })) throw new Error();
    run('/usr/bin/docker', ['image', 'inspect', image]);
    run('/usr/bin/python3', ['/opt/project-management-runtime/current/ops/oci-runtime/imds-guard.py', '--check']);
    run('/bin/bash', ['/opt/project-management-runtime/current/ops/oci-runtime/backup-flight-db.sh'], 210000);
    ownsSecrets = true;
    run('/opt/node24/bin/node', ['/opt/project-management-runtime/current/ops/oci-runtime/vault-runtime.mjs', '--flight-migration'], 180000);
    const url = new URL(await readServiceFile('flight-migration', 'DATABASE_URL'));
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || decodeURIComponent(url.pathname) !== '/flight-db') throw new Error();
    ownsContainer = true;
    run('/usr/bin/docker', args, 180000);
  } finally {
    if (ownsContainer) {
      spawnSync('/usr/bin/docker', ['rm', '-f', name], { stdio: 'pipe', timeout: 30000 });
      const remaining = spawnSync('/usr/bin/docker', ['container', 'inspect', name], { encoding: 'utf8', timeout: 30000 });
      if (remaining.status !== 1 || remaining.stdout?.trim() !== '[]') throw new Error();
    }
    if (ownsSecrets) {
      const info = await lstat(secretRoot).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (info) {
        if (!info.isDirectory() || info.uid !== 0 || info.gid !== 0 || (info.mode & 0o777) !== 0o750) throw new Error();
        await rm(secretRoot, { recursive: true });
      }
    }
    if (locked) await rmdir(lock);
  }
  process.stdout.write('FLIGHT_MIGRATION_SUCCEEDED\n');
}
if (isMainModule(import.meta.url)) main().catch(() => { process.stderr.write('FLIGHT_MIGRATION_FAILED\n'); process.exitCode = 1; });
