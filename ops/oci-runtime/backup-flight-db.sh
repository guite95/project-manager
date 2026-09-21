# Fixed Flight database only. Backup remains root-only; never print database contents.
sudo -n python3 - <<'PY'
import os, json, subprocess, datetime, stat, shutil
root = '/var/backups/oci-vault-migration'
try:
    s = os.lstat(root)
    if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or stat.S_IMODE(s.st_mode) != 0o700: raise RuntimeError()
    if shutil.disk_usage(root).free < 1024**3: raise RuntimeError()
    path = root + '/flight-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.dump'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        result = subprocess.run(['docker','exec','postgresql','sh','-c',
            'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -Fc --no-password -d flight-db'],
            stdout=output, stderr=subprocess.PIPE, timeout=180)
        output.flush(); os.fsync(output.fileno())
    if result.returncode or os.stat(path).st_size == 0: raise RuntimeError()
    with open(path,'rb') as source:
        verify = subprocess.run(['docker','exec','-i','postgresql','pg_restore','--list'], stdin=source, capture_output=True, timeout=30)
    if verify.returncode: raise RuntimeError()
    print(json.dumps({'ok':True,'path':path,'bytes':os.stat(path).st_size,'archive_readable':True,'restore_rehearsal':False}))
except Exception:
    print(json.dumps({'ok':False,'code':'FLIGHT_BACKUP_FAILED','partial_backup_preserved':True}))
    raise SystemExit(1)
PY
