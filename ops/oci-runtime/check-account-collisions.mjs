// Read-only account-name preflight. Existing names are captured, never printed.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { credentialFields, readCredentialInput } from './credential-input.mjs';

const script = `sudo python3 - <<'PY'
import subprocess, json, sqlite3
def run(args):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=25)
        return p.stdout if p.returncode == 0 else None
    except Exception: return None
out = {}
pg = run(['docker','exec','postgresql','sh','-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X -U "$POSTGRES_USER" -d postgres -Atqc "SELECT rolname FROM pg_roles"'])
out['postgres'] = pg.splitlines() if pg is not None else None
mysql = run(['docker','exec','mysql','sh','-c',
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names -uroot -e "SELECT DISTINCT User FROM mysql.user"'])
out['mysql-local'] = mysql.splitlines() if mysql is not None else None
redis = run(['docker','exec','redis','redis-cli','--raw','ACL','USERS'])
out['redis'] = redis.splitlines() if redis is not None and not redis.startswith(('NOAUTH','WRONGPASS','ERR')) else None
rabbit = run(['docker','exec','rabbitmq','rabbitmqctl','list_users','--formatter','json'])
try: out['rabbitmq'] = [row['user'] for row in json.loads(rabbit)] if rabbit else None
except Exception: out['rabbitmq'] = None
try:
    db = sqlite3.connect('file:/var/lib/docker/volumes/monitoring_grafana_data/_data/grafana.db?mode=ro', uri=True)
    out['grafana'] = [row[0] for row in db.execute('SELECT login FROM user')]
    db.close()
except Exception: out['grafana'] = None
print(json.dumps(out))
PY
`;

try {
  const { credentials, report } = await readCredentialInput('.private/oci-vault-credentials.json');
  if (!report.ok) throw new Error();
  const processResult = spawnSync('python3', [resolve(homedir(), '.codex/skills/oci-ssh/scripts/oci_ssh.py'), '--script'], {
    input: script, encoding: 'utf8', timeout: 120000, maxBuffer: 262144,
  });
  if (processResult.status !== 0) throw new Error();
  const existing = JSON.parse(processResult.stdout);
  const checks = credentialFields.filter(field => field.kind === 'username').map(field => {
    const [group, account, key] = field.path.split('.');
    const names = existing[field.server];
    const valid = Array.isArray(names) && names.length > 0 && names.every(name => typeof name === 'string');
    return {
      path: field.path,
      status: !valid ? 'NOT_VERIFIED'
        : names.some(name => name.toLowerCase() === credentials[group][account][key].toLowerCase()) ? 'COLLISION' : 'AVAILABLE',
    };
  });
  // AVAILABLE is a snapshot, not permission to overwrite/create an account.
  const complete = checks.every(check => check.status === 'AVAILABLE');
  console.log(JSON.stringify({ complete, checks }));
  process.exitCode = checks.some(check => check.status === 'COLLISION') ? 1 : complete ? 0 : 2;
} catch {
  console.log(JSON.stringify({ complete: false, code: 'ACCOUNT_PREFLIGHT_FAILED' }));
  process.exitCode = 1;
}
