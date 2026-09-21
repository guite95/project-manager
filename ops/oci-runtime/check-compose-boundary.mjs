// Read-only: inspect local source with the server's Compose parser. Never load .env.
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = await Promise.all(['docker-compose.yml', 'docker-compose.wif.yml', 'docker-compose.identity-boundary.yml', 'docker-compose.vault.yml']
  .map(name => readFile(resolve(root, name), 'utf8')));
const payload = Buffer.from(JSON.stringify(files)).toString('base64');
const script = `sudo python3 - <<'PY'
import os, json, base64, subprocess
fds = []
try:
    sources = json.loads(base64.b64decode('${payload}'))
    for source in sources:
        fd = os.memfd_create('pm-compose-validation')
        os.write(fd, source.encode())
        fds.append(fd)
    env = {'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME':'/nonexistent', 'PM_RUNTIME_GID':'23456', 'DATABASE_URL':'postgresql://fixture:fixture@db/fixture',
        'APP_PASSWORD_HASH':'fixture-hash', 'SESSION_SECRET':'fixture-secret', 'DB_NETWORK_NAME':'fixture-network'}
    def check(indices, runtime_gid=True, vault=False):
        command = ['docker','compose','--env-file','/dev/null','--project-directory','/tmp','-p','pm-boundary-validation']
        for index in indices:
            command += ['-f','/proc/self/fd/' + str(fds[index])]
        effective_env = dict(env)
        if not runtime_gid: effective_env.pop('PM_RUNTIME_GID')
        if vault:
            for key in ['DATABASE_URL','APP_PASSWORD_HASH','SESSION_SECRET']: effective_env.pop(key)
        process = subprocess.run(command + ['config','--format','json'], env=effective_env,
            pass_fds=fds, capture_output=True, text=True, timeout=30)
        if process.returncode: return None
        app = json.loads(process.stdout)['services']['app']
        expected = {'/run/project-management-broker','/run/project-management-google'}
        if vault: expected.add('/run/oci-service-secrets/project-management')
        mounts = app.get('volumes', [])
        values = app.get('environment', {})
        return all([
            len(mounts) == len(expected),
            {m['target'] for m in mounts} == expected,
            all(m['source'] == m['target'] and m['type'] == 'bind' and m.get('read_only') is True
                and m.get('bind', {}).get('create_host_path', False) is False for m in mounts),
            values.get('OCI_STORAGE_AUTH') == 'broker',
            values.get('GOOGLE_APPLICATION_CREDENTIALS') == '',
            values.get('GOOGLE_ACCESS_TOKEN_FILE') == '/run/project-management-google/access-token.json',
            values.get('OCI_STORAGE_BROKER_SOCKET') == '/run/project-management-broker/storage.sock',
            app.get('group_add') == ['23456'],
            app.get('restart') == 'no',
            not vault or (values.get('PM_SECRET_DIRECTORY') == '/run/oci-service-secrets/project-management'
                and not any(key in values for key in ['DATABASE_URL','SESSION_SECRET','APP_PASSWORD_HASH','PM_MIGRATION_SECRET_DIRECTORY'])
                and app.get('command') == ['node','server.js']),
        ])
    results = {'base_boundary':check([0,2]) is True, 'base_wif_boundary':check([0,1,2]) is True,
        'missing_gid_rejected':check([0,2],False) is None, 'wrong_order_detected':check([0,2,1]) is False,
        'vault_no_env_secrets':check([0,2,3],vault=True) is True,
        'vault_replaces_wif':check([0,1,2,3],vault=True) is True,
        'vault_wrong_order_rejected':check([0,3,2],vault=True) is False}
    print(json.dumps({'ok':all(results.values()),'checks':results}))
    raise SystemExit(0 if all(results.values()) else 1)
except Exception:
    print(json.dumps({'ok':False,'code':'COMPOSE_BOUNDARY_CHECK_FAILED'}))
    raise SystemExit(1)
finally:
    for fd in fds: os.close(fd)
PY
`;
const result = spawnSync('python3', [resolve(homedir(), '.codex/skills/oci-ssh/scripts/oci_ssh.py'), '--script'], {
  input: script, encoding: 'utf8', timeout: 150000, maxBuffer: 65536,
});
// Do not forward arbitrary SSH/Compose diagnostics or source content.
try {
  const report = JSON.parse(result.stdout);
  if (typeof report.ok !== 'boolean') throw new Error();
  const keys = ['base_boundary', 'base_wif_boundary', 'missing_gid_rejected', 'wrong_order_detected',
    'vault_no_env_secrets', 'vault_replaces_wif', 'vault_wrong_order_rejected'];
  const checks = Object.fromEntries(keys.map(key => [key, report.checks?.[key] === true]));
  const ok = result.status === 0 && report.ok && Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }));
  process.exitCode = ok ? 0 : 1;
} catch {
  console.log(JSON.stringify({ ok: false, code: 'COMPOSE_BOUNDARY_CHECK_FAILED' }));
  process.exitCode = 1;
}
