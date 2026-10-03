"""Install the dedicated collector through existing personal SSH; default is inspection only."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys

FILES = ['jobs-worker-runtime.py', 'project-management-jobs.service', 'jobs-worker.json']

# The payload contains repository code only. DB credentials stay in the existing container.
REMOTE = r'''
import base64, datetime, fcntl, hashlib, json, os, pathlib, subprocess
bundle = json.loads(base64.b64decode('__PAYLOAD__'))
def run(args, input=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True, timeout=150)
    if result.returncode: raise RuntimeError('JOBS_INSTALL_COMMAND_FAILED: ' + args[0])
    return result.stdout
if os.getuid() != 0: raise RuntimeError('ROOT_REQUIRED')
lock = open('/run/lock/project-management-jobs-install.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
if subprocess.run(['systemctl', 'is-active', '--quiet', 'project-management-jobs.service']).returncode == 0:
    raise RuntimeError('STOP_EXISTING_JOBS_SERVICE_BEFORE_UPDATING')
for unit in ['project-management-runtime.service', 'project-management-secrets.service', 'project-management-imds-guard.service']:
    run(['systemctl', 'is-active', '--quiet', unit])
if set(bundle) != {'jobs-worker-runtime.py', 'project-management-jobs.service', 'jobs-worker.json'}: raise RuntimeError('INVALID_BUNDLE')
files = {name: base64.b64decode(item['content']) for name, item in bundle.items()}
for name, data in files.items():
    if hashlib.sha256(data).hexdigest() != bundle[name]['sha256']: raise RuntimeError('HASH_MISMATCH')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup = pathlib.Path('/var/backups/project-management-jobs') / stamp
backup.mkdir(parents=True, mode=0o700)
os.chmod(backup.parent, 0o700)
unit_path = pathlib.Path('/etc/systemd/system/project-management-jobs.service')
root = pathlib.Path('/opt/project-management-jobs')
current = root / 'current'
if unit_path.exists():
    data = unit_path.read_bytes()
    if b'/opt/project-management-jobs/current/jobs-worker-runtime.py prepare' not in data:
        raise RuntimeError('UNMANAGED_EXISTING_UNIT')
    (backup / unit_path.name).write_bytes(data)
if current.is_symlink():
    (backup / 'previous-release.txt').write_text(os.readlink(current))
elif current.exists(): raise RuntimeError('UNMANAGED_RELEASE_PATH')
snapshot_script = r"""
import pg from 'pg';
import {getRuntimeSecret} from './lib/server/runtime-secrets.mjs';
const pool = new pg.Pool({connectionString:getRuntimeSecret('DATABASE_URL'),max:1,connectionTimeoutMillis:10000,statement_timeout:15000});
pool.on('error',()=>{});
try {
  const {rows}=await pool.query("SELECT key,value FROM app_setting WHERE key LIKE 'recruitment:job%' ORDER BY key");
  console.log(JSON.stringify({capturedAt:new Date().toISOString(),rows}));
} catch {process.exitCode=1;} finally {await pool.end();}
"""
snapshot = run(['docker', 'exec', '-i', 'project-management', 'node', '--input-type=module'], snapshot_script).encode()
rows = json.loads(snapshot)['rows']
if any(not row['key'].startswith('recruitment:job') for row in rows): raise RuntimeError('INVALID_BACKUP')
snapshot_path = backup / 'job-settings.json'
snapshot_path.write_bytes(snapshot)
os.chmod(snapshot_path, 0o600)
backup_hash = hashlib.sha256(snapshot).hexdigest()
if hashlib.sha256(snapshot_path.read_bytes()).hexdigest() != backup_hash: raise RuntimeError('BACKUP_NOT_VERIFIED')
release_hash = hashlib.sha256(b''.join(files[name] for name in sorted(files))).hexdigest()
release = root / 'releases' / release_hash
release.mkdir(parents=True, mode=0o755, exist_ok=True)
for path in [root, root / 'releases', release]:
    info = path.stat()
    if info.st_uid != 0 or info.st_mode & 0o022 or path.is_symlink(): raise RuntimeError('UNSAFE_RELEASE_DIRECTORY')
for name, data in files.items():
    path = release / name
    if path.exists() and path.read_bytes() != data: raise RuntimeError('RELEASE_NOT_IMMUTABLE')
    path.write_bytes(data)
    os.chmod(path, 0o644)
    if hashlib.sha256(path.read_bytes()).hexdigest() != bundle[name]['sha256']: raise RuntimeError('RELEASE_VERIFY_FAILED')
temporary = root / ('current-' + stamp)
temporary.symlink_to(release)
os.replace(temporary, current)
run(['systemd-analyze', 'verify', str(release / unit_path.name)])
temporary_unit = unit_path.with_name(unit_path.name + '.new')
temporary_unit.write_bytes(files[unit_path.name])
os.chmod(temporary_unit, 0o644)
os.replace(temporary_unit, unit_path)
run(['systemctl', 'daemon-reload'])
run(['systemctl', 'enable', 'project-management-jobs.service'])
run(['systemctl', 'reset-failed', 'project-management-jobs.service'])
run(['systemctl', 'start', 'project-management-jobs.service'])
run(['systemctl', 'is-active', '--quiet', 'project-management-jobs.service'])
print(json.dumps({'backupVerified':True,'backupRows':len(rows),'backupPath':str(snapshot_path),'backupSha256':backup_hash,'release':release_hash,'service':'active'}))
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--ssh-helper', type=Path, default=Path.home() / '.codex/skills/oci-ssh/scripts/oci_ssh.py')
    args = parser.parse_args()
    bundle = {}
    for name in FILES:
        path = Path(__file__).resolve().parents[2] / 'config/jobs-worker.example.json' if name == 'jobs-worker.json' else Path(__file__).with_name(name)
        content = path.read_bytes()
        bundle[name] = {'sha256': hashlib.sha256(content).hexdigest(), 'content': base64.b64encode(content).decode()}
    if not args.apply:
        print(json.dumps({'mode': 'inspect', 'files': {name: item['sha256'] for name, item in bundle.items()}}))
        return
    payload = base64.b64encode(json.dumps(bundle).encode()).decode()
    script = "sudo python3 - <<'JOBS_INSTALL_PY'\n" + REMOTE.replace('__PAYLOAD__', payload) + '\nJOBS_INSTALL_PY\n'
    result = subprocess.run([sys.executable, str(args.ssh_helper), '--script'], input=script, text=True)
    raise SystemExit(result.returncode)


if __name__ == '__main__': main()
