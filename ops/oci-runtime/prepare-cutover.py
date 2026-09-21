"""Prepare trusted systemd units and persist Compose selection, without starting anything."""
import grp
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tempfile
import sys


def deployment_mode():
    marker = pathlib.Path('/etc/project-management-vault.enabled')
    try: s = marker.lstat()
    except FileNotFoundError: return 'identity'
    if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or stat.S_IMODE(s.st_mode) != 0o600 or s.st_nlink != 1: raise RuntimeError()
    fd = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        if source.read(32) != b'enabled\n': raise RuntimeError()
    return 'vault'


def recordings_enabled():
    marker = pathlib.Path('/etc/project-management-recordings.enabled')
    try: s = marker.lstat()
    except FileNotFoundError: return False
    if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or stat.S_IMODE(s.st_mode) != 0o600 or s.st_nlink != 1: raise RuntimeError()
    fd = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        if source.read(32) != b'enabled\n': raise RuntimeError()
    if deployment_mode() != 'vault': raise RuntimeError()
    return True


def prepare():
    if os.getuid() != 0: raise RuntimeError()
    mode = deployment_mode()
    recordings = recordings_enabled()
    release = pathlib.Path('/opt/project-management-runtime/current').resolve(strict=True)
    if release.parent != pathlib.Path('/opt/project-management-runtime/releases'): raise RuntimeError()
    for path in [release, release.parent, release.parent.parent]:
        s = path.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022: raise RuntimeError()
    sources = [release / 'ops/oci-runtime' / name for name in [
        'project-management-runtime.service', 'project-management-imds-guard.service']]
    if mode == 'vault': sources.append(release / 'ops/oci-runtime/project-management-secrets.service')
    if recordings: sources.append(release / 'ops/oci-runtime/project-management-recordings.service')
    dropin = release / 'ops/oci-runtime/project-management-vault.conf'
    for path in sources + ([dropin] if mode == 'vault' else []):
        s = path.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022: raise RuntimeError()
    result = subprocess.run(['systemd-analyze', 'verify'] + list(map(str, sources)), capture_output=True)
    if result.returncode: raise RuntimeError()
    gid = grp.getgrnam('pm-runtime').gr_gid
    env_path = pathlib.Path('/home/ubuntu/project-management/.env')
    s = env_path.lstat()
    if not stat.S_ISREG(s.st_mode) or stat.S_IMODE(s.st_mode) != 0o600: raise RuntimeError()
    # The root-owned opt-in cannot be silently undone by a later normal deployment.
    lines = env_path.read_text().splitlines()
    removed = {'COMPOSE_FILE', 'PM_RUNTIME_GID'}
    if mode == 'vault': removed.update({'DATABASE_URL', 'SESSION_SECRET', 'APP_PASSWORD_HASH'})
    kept = []
    for line in lines:
        assignment = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
        if assignment and assignment[1] in removed:
            value = assignment[2].strip()
            if value.startswith(('"', "'")) and not (len(value) >= 2 and value.endswith(value[0])): raise RuntimeError()
        else: kept.append(line)
    lines = kept
    compose = 'docker-compose.yml:docker-compose.identity-boundary.yml'
    if mode == 'vault': compose += ':docker-compose.vault.yml'
    if recordings: compose += ':docker-compose.recordings.yml'
    lines.append('COMPOSE_FILE=' + compose)
    lines.append(f'PM_RUNTIME_GID={gid}')
    backup = pathlib.Path('/var/backups/oci-vault-migration')
    s_backup = backup.lstat()
    if not stat.S_ISDIR(s_backup.st_mode) or s_backup.st_uid != 0 or stat.S_IMODE(s_backup.st_mode) != 0o700: raise RuntimeError()
    for source, name in [(env_path, f'pm-before-{mode}.env'), (pathlib.Path('/etc/systemd/system/project-management-runtime.service'), f'pm-before-{mode}.service')]:
        target = backup / name
        if not target.exists():
            with target.open('xb') as output, source.open('rb') as original:
                os.chmod(target, 0o600)
                shutil.copyfileobj(original, output)
    def replace(path, content, uid=0, gid=0, mode=0o644):
        fd, temporary = tempfile.mkstemp(prefix='.pm-cutover-', dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as output:
                os.fchown(output.fileno(), uid, gid); os.fchmod(output.fileno(), mode)
                output.write(content); output.flush(); os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    replace(env_path, ('\n'.join(lines) + '\n').encode(), s.st_uid, s.st_gid, 0o600)
    replace(pathlib.Path('/etc/project-management-runtime.conf'), f'PM_RUNTIME_GID={gid}\n'.encode(), mode=0o600)
    for source in sources:
        replace(pathlib.Path('/etc/systemd/system') / source.name, source.read_bytes())
    if mode == 'vault':
        directory = pathlib.Path('/etc/systemd/system/project-management-runtime.service.d')
        directory.mkdir(mode=0o755, exist_ok=True)
        s = directory.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022: raise RuntimeError()
        replace(directory / 'vault.conf', dropin.read_bytes())


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--mode']: print(deployment_mode())
        elif sys.argv[1:] == ['--recordings']: print('enabled' if recordings_enabled() else 'disabled')
        elif len(sys.argv) == 1: prepare()
        else: raise RuntimeError()
    except Exception:
        print('IDENTITY_CUTOVER_PREPARATION_FAILED')
        raise SystemExit(1)
