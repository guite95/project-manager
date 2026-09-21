// Bootstrap host-only services from an already pushed, reviewed Git revision.
// Does not change app mounts, networking, DB credentials, or Vault IAM.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const revision = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('RELEASE_REVISION_REQUIRED');
execFileSync('git', ['merge-base', '--is-ancestor', revision, 'origin/main']);
const files = [
  'ops/oci-runtime/host-runtime.mjs', 'ops/oci-runtime/object-broker.mjs',
  'ops/oci-runtime/token-publisher.mjs', 'lib/server/object-storage-broker-protocol.mjs',
  'lib/server/google-runtime-auth.mjs', 'ops/oci-runtime/identity-readiness.mjs',
  'ops/oci-runtime/imds-guard.py', 'ops/oci-runtime/project-management-imds-guard.service',
  'ops/oci-runtime/project-management-runtime.service',
  'ops/oci-runtime/project-management-recordings.service',
  'ops/oci-runtime/project-management-object-broker.service',
  'ops/oci-runtime/project-management-google-token.service', 'ops/oci-runtime/project-management-google-token.timer',
  'ops/oci-runtime/vault-secrets.mjs', 'ops/oci-runtime/vault-client.mjs',
  'ops/oci-runtime/vault-runtime.mjs', 'ops/oci-runtime/project-management-secrets.service',
  'lib/server/runtime-secrets.mjs', 'lib/server/cli-entry.mjs',
  'ops/oci-runtime/migrate-pm.mjs', 'ops/oci-runtime/pg-roles.mjs',
  'ops/oci-runtime/provision-pm-roles.mjs',
  'ops/oci-runtime/vault-readiness.mjs', 'ops/oci-runtime/project-management-vault.conf',
  'ops/oci-runtime/prepare-cutover.py', 'ops/oci-runtime/backup-pm-db.sh',
  'ops/oci-runtime/flight-secrets.service', 'ops/oci-runtime/flight-runtime.service',
  'ops/oci-runtime/service-readiness.mjs', 'ops/oci-runtime/migrate-flight.mjs',
  'ops/oci-runtime/backup-flight-db.sh',
  'ops/oci-runtime/flight-roles.mjs', 'ops/oci-runtime/provision-flight-roles.mjs',
  'ops/oci-runtime/youtube-secrets@.service', 'ops/oci-runtime/youtube-runtime@.service',
  'ops/oci-runtime/youtube-redis-acl.service', 'ops/oci-runtime/youtube-redis-acl.timer',
  'ops/oci-runtime/youtube-redis-acl.py', 'ops/oci-runtime/youtube-database.py',
  'ops/oci-runtime/youtube-backup.py', 'ops/oci-runtime/migrate-youtube.mjs',
];
const payload = Buffer.from(JSON.stringify({ revision,
  packageHash: createHash('sha256').update(execFileSync('git', ['show', `${revision}:package.json`])).digest('hex'),
  files: Object.fromEntries(files.map(path => [path, execFileSync('git', ['show', `${revision}:${path}`]).toString('base64')])),
})).toString('base64');
const script = `sudo python3 - <<'PY'
import base64, json, os, subprocess, stat, grp, re, hashlib
data = json.loads(base64.b64decode('${payload}'))
release = '/opt/project-management-runtime/releases/' + data['revision']
unit_names = ['project-management-object-broker.service','project-management-google-token.service','project-management-google-token.timer']
def run(args, **kwargs):
    p = subprocess.run(args, capture_output=True, timeout=180, **kwargs)
    if p.returncode: raise RuntimeError('HOST_STAGE_COMMAND_FAILED')
    return p.stdout
def protected_directory(path):
    if not os.path.exists(path): os.mkdir(path, 0o755)
    s = os.lstat(path)
    if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022: raise RuntimeError()
def write_new(path, content, mode=0o644):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as f: f.write(content)
try:
    if os.getuid() != 0 or not os.path.isfile('/opt/node24/bin/node'): raise RuntimeError()
    current = '/opt/project-management-runtime/current'
    upgrade = os.path.islink(current)
    if os.path.lexists(release) or (os.path.lexists(current) and not upgrade): raise RuntimeError('EXISTING_TARGET')
    if upgrade:
        old_release = os.path.realpath(current)
        if not re.fullmatch('/opt/project-management-runtime/releases/[a-f0-9]{40}', old_release): raise RuntimeError()
        protected_directory(old_release)
    else:
        for path in ['/etc/project-management-object-broker.conf'] + ['/etc/systemd/system/' + name for name in unit_names]:
            if os.path.lexists(path): raise RuntimeError('EXISTING_TARGET')
    app = json.loads(run(['docker','inspect','project-management']))[0]
    package = run(['docker','exec','project-management','cat','/app/package.json'])
    if hashlib.sha256(package).hexdigest() != data['packageHash']: raise RuntimeError('DEPENDENCY_MANIFEST_MISMATCH')
    env = dict(item.split('=',1) for item in app['Config']['Env'] if '=' in item)
    conf = ''
    for key in ['OCI_STORAGE_REGION','OCI_STORAGE_NAMESPACE','OCI_STORAGE_BUCKET']:
        value = env.get(key, '')
        if not re.fullmatch('[A-Za-z0-9._-]+', value): raise RuntimeError('BROKER_CONFIG_INVALID')
        conf += key + '=' + value + '\\n'
    if not upgrade:
        try: grp.getgrnam('pm-runtime'); raise RuntimeError('EXISTING_GROUP')
        except KeyError: pass
    for path in ['/opt/project-management-runtime','/opt/project-management-runtime/releases',release]: protected_directory(path)
    for path in ['ops','ops/oci-runtime','lib','lib/server']: protected_directory(release + '/' + path)
    for path, content in data['files'].items(): write_new(release + '/' + path, base64.b64decode(content))
    # Dependencies come from the deployed Linux ARM64 image with matching package.json.
    # No local node_modules or application credential/configuration is copied.
    extract_name = 'pm-runtime-extract-' + data['revision'][:12]
    run(['docker','create','--name',extract_name,'--network','none','--entrypoint','/bin/true',app['Image']])
    try: run(['docker','cp',extract_name + ':/app/node_modules',release + '/node_modules'])
    finally: run(['docker','rm',extract_name])
    run(['chown','-R','root:root',release])
    run(['chmod','-R','go-w',release])
    if not upgrade: run(['groupadd','--system','pm-runtime'])
    gid = grp.getgrnam('pm-runtime').gr_gid
    if not upgrade: write_new('/etc/project-management-object-broker.conf',conf.encode(),0o600)
    os.symlink(release,current + '.next-' + data['revision'])
    os.replace(current + '.next-' + data['revision'],current)
    run(['systemd-analyze','verify'] + [release + '/ops/oci-runtime/' + name for name in unit_names])
    if not upgrade:
        for name in unit_names:
            with open(release + '/ops/oci-runtime/' + name,'rb') as f: write_new('/etc/systemd/system/' + name,f.read())
    # Existing host services remain on their known-running code until an explicit restart.
    run(['systemctl','daemon-reload'])
    run(['systemctl','start','project-management-object-broker.service'])
    run(['systemctl','start','project-management-google-token.service'])
    run(['systemctl','enable','project-management-object-broker.service','project-management-google-token.timer'])
    run(['systemctl','start','project-management-google-token.timer'])
    run(['/opt/node24/bin/node',release + '/ops/oci-runtime/identity-readiness.mjs',str(gid)])
    print(json.dumps({'ok':True,'revision':data['revision'],'runtime_gid':gid,'app_auth_changed':False}))
except Exception:
    print(json.dumps({'ok':False,'code':'HOST_RUNTIME_STAGE_FAILED','partial_stage_preserved':True,'app_auth_changed':False}))
    raise SystemExit(1)
PY
`;
const result = spawnSync('python3', [resolve(homedir(), '.codex/skills/oci-ssh/scripts/oci_ssh.py'), '--script'], {
  input: script, encoding: 'utf8', timeout: 300000, maxBuffer: 65536,
});
try {
  const report = JSON.parse(result.stdout);
  console.log(JSON.stringify({ ok: result.status === 0 && report.ok === true, revision,
    runtimeGid: Number.isInteger(report.runtime_gid) ? report.runtime_gid : null, appAuthChanged: false }));
  process.exitCode = result.status === 0 && report.ok === true ? 0 : 1;
} catch {
  console.log(JSON.stringify({ ok: false, code: 'HOST_RUNTIME_STAGE_FAILED' }));
  process.exitCode = 1;
}
