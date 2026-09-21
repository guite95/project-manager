"""Prepare trusted systemd units and persist Compose selection, without starting anything."""
import grp
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile


def prepare():
    if os.getuid() != 0: raise RuntimeError()
    release = pathlib.Path('/opt/project-management-runtime/current').resolve(strict=True)
    if release.parent != pathlib.Path('/opt/project-management-runtime/releases'): raise RuntimeError()
    for path in [release, release.parent, release.parent.parent]:
        s = path.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022: raise RuntimeError()
    sources = [release / 'ops/oci-runtime' / name for name in [
        'project-management-runtime.service', 'project-management-imds-guard.service']]
    for path in sources:
        s = path.lstat()
        if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022: raise RuntimeError()
    result = subprocess.run(['systemd-analyze', 'verify'] + list(map(str, sources)), capture_output=True)
    if result.returncode: raise RuntimeError()
    gid = grp.getgrnam('pm-runtime').gr_gid
    env_path = pathlib.Path('/home/ubuntu/project-management/.env')
    s = env_path.lstat()
    if not stat.S_ISREG(s.st_mode) or stat.S_IMODE(s.st_mode) != 0o600: raise RuntimeError()
    # Existing secret values remain unchanged during this identity-only rollout.
    lines = env_path.read_text().splitlines()
    lines = [line for line in lines if not line.lstrip().startswith(('COMPOSE_FILE=', 'export COMPOSE_FILE=', 'PM_RUNTIME_GID=', 'export PM_RUNTIME_GID='))]
    lines.append('COMPOSE_FILE=docker-compose.yml:docker-compose.identity-boundary.yml')
    lines.append(f'PM_RUNTIME_GID={gid}')
    backup = pathlib.Path('/var/backups/oci-vault-migration')
    s_backup = backup.lstat()
    if not stat.S_ISDIR(s_backup.st_mode) or s_backup.st_uid != 0 or stat.S_IMODE(s_backup.st_mode) != 0o700: raise RuntimeError()
    for source, name in [(env_path, 'pm-before-identity.env'), (pathlib.Path('/etc/systemd/system/project-management-runtime.service'), 'pm-before-identity.service')]:
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


if __name__ == '__main__':
    try: prepare()
    except Exception:
        print('IDENTITY_CUTOVER_PREPARATION_FAILED')
        raise SystemExit(1)
