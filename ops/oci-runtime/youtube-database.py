"""Operator/host-only MySQL tasks. Input via stdin; never emit SQL, identities or errors."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import resource
import stat
import subprocess
import sys

MYSQLSH = '/home/ubuntu/.local/share/youtube-sync-migration/tools/mysql-shell-26.7.1-linux-glibc2.28-arm-64bit/bin/mysqlsh'
HOST = 'devukmysql.mysqlfree.vcn12042259.oraclevcn.com'
CA = '/home/ubuntu/.local/share/youtube-sync-migration/ca.pem'

# This is executed by the installed MySQL Shell Python interpreter.
TASK = r'''
import sys,json,re
phase='connect'
try:
 d=json.load(sys.stdin); s=mysql.get_session(d['connection']); shell.set_session(s)
 if not s.run_sql("SHOW SESSION STATUS LIKE 'Ssl_cipher'").fetch_one()[1]:raise RuntimeError()
 phase='tables'
 tables=[r[0] for r in s.run_sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='youtube_sync' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME").fetch_all()]
 if not tables or 'flyway_schema_history' not in tables or any(not re.fullmatch('[A-Za-z0-9_]+',t) for t in tables):raise RuntimeError()
 mode=d['mode']; result={'ok':True,'tlsVerified':True,'tableCount':len(tables)}
 if mode=='backup':
  # A brief schema-only read lock protects all dump sessions without global privileges.
  s.run_sql('SET SESSION lock_wait_timeout=5')
  s.run_sql('LOCK TABLES '+','.join('`youtube_sync`.`'+t+'` READ' for t in tables))
  try:
   util.dump_schemas(['youtube_sync'],d['backup'],{'consistent':False,'threads':1,'showProgress':False,'routines':False,'events':False,'triggers':False})
  finally:s.run_sql('UNLOCK TABLES')
  result['schemaReadLockUsed']=True
 elif mode in ['inspect','provision','verify','retire']:
  phase='account-input'
  accounts=d['accounts']; names=[a['new_username'] for a in accounts.values()]
  if len(set(names))!=2 or any(not re.fullmatch('[A-Za-z_][A-Za-z0-9_-]{0,31}',n) for n in names):raise RuntimeError()
  phase='account-inventory'
  existing={r[0]:r[1] for r in s.run_sql('SELECT User,Host FROM mysql.user WHERE User IN (?,?)',names).fetch_all()}
  if any(h!='10.0.0.172' for h in existing.values()):raise RuntimeError()
  result['existingNewAccounts']=len(existing)
  if mode=='provision':
   if existing:raise RuntimeError('COLLISION')
   for kind,a in accounts.items():
    identity="'"+a['new_username']+"'@'10.0.0.172'"
    s.run_sql('CREATE USER '+identity+' IDENTIFIED BY ? REQUIRE SSL',[a['new_password']])
    if kind=='runtime':
     for t in tables:s.run_sql('GRANT '+('SELECT' if t=='flyway_schema_history' else 'SELECT,INSERT,UPDATE,DELETE')+' ON `youtube_sync`.`'+t+'` TO '+identity)
    else:
     s.run_sql('GRANT SELECT,INSERT,UPDATE,DELETE ON `youtube_sync`.* TO '+identity+' WITH GRANT OPTION')
     s.run_sql('GRANT CREATE,ALTER,INDEX,REFERENCES,LOCK TABLES,SHOW VIEW ON `youtube_sync`.* TO '+identity)
   result['createdAccounts']=2
  if mode in ['verify','provision']:
   phase='verify-grants'
   for kind,a in accounts.items():
    options=dict(d['connection'],user=a['new_username'],password=a['new_password']); check=mysql.get_session(options)
    if not check.run_sql("SHOW SESSION STATUS LIKE 'Ssl_cipher'").fetch_one()[1]:raise RuntimeError()
    check.run_sql('SELECT COUNT(*) FROM youtube_sync.flyway_schema_history').fetch_one();check.close()
    global_grants=s.run_sql('SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE=?',["'"+a['new_username']+"'@'10.0.0.172'"]).fetch_all()
    if any(r[0]!='USAGE' for r in global_grants):raise RuntimeError()
    grantee="'"+a['new_username']+"'@'10.0.0.172'"
    if kind=='runtime':
     if s.run_sql('SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE=?',[grantee]).fetch_one()[0]:raise RuntimeError()
     grants=s.run_sql('SELECT TABLE_SCHEMA,TABLE_NAME,PRIVILEGE_TYPE,IS_GRANTABLE FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE=?',[grantee]).fetch_all()
     expected={(t,p) for t in tables for p in (['SELECT'] if t=='flyway_schema_history' else ['SELECT','INSERT','UPDATE','DELETE'])}
     if {(r[1],r[2]) for r in grants}!=expected or any(r[0]!='youtube_sync' or r[3]!='NO' for r in grants):raise RuntimeError()
    if list(s.run_sql('SELECT ssl_type,account_locked FROM mysql.user WHERE User=? AND Host=?',[a['new_username'],'10.0.0.172']).fetch_one())!=['ANY','N']:raise RuntimeError()
   result['newLoginsVerified']=True;result['noGlobalPrivileges']=True
  if mode=='retire':
   # Fixed historical YouTube-only identities; never touch shared/default/admin users.
   for old in ['youtube_sync_app','youtube_sync_migration']:
    if old in names:raise RuntimeError()
    count=s.run_sql('SELECT COUNT(*) FROM performance_schema.threads WHERE PROCESSLIST_USER=? AND TYPE=?',[old,'FOREGROUND']).fetch_one()[0]
    if count:raise RuntimeError()
    s.run_sql("ALTER USER '"+old+"'@'10.0.0.172' ACCOUNT LOCK")
   result['oldYoutubeAccountsLocked']=True
 s.close();print('SAFE_REPORT:'+json.dumps(result))
except Exception:
 print('SAFE_REPORT:'+json.dumps({'ok':False,'code':'YOUTUBE_DATABASE_TASK_FAILED','phase':phase}));sys.exit(1)
'''


def execute(data):
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if os.getuid() != 0:
        raise RuntimeError()
    data['connection'] = dict(scheme='mysql', host=HOST, port=3306, user=data.pop('user'), password=data.pop('password'),
                              **{'ssl-mode': 'VERIFY_IDENTITY', 'ssl-ca': CA})
    backup = None
    if data['mode'] == 'backup':
        root = Path('/var/backups/youtube-sync-vault')
        root.mkdir(mode=0o700, exist_ok=True)
        s = root.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or stat.S_IMODE(s.st_mode) != 0o700:
            raise RuntimeError()
        backup = root / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        data['backup'] = str(backup)
    p = subprocess.run([MYSQLSH, '--no-defaults', '--py', '--quiet-start=2', '--no-wizard', '--log-file=/dev/null',
                        '--log-sql=off', '--execute', TASK], input=json.dumps(data), capture_output=True, text=True, timeout=150)
    reports = [line[len('SAFE_REPORT:'):] for line in p.stdout.splitlines() if line.startswith('SAFE_REPORT:')]
    if len(reports)==1 and not json.loads(reports[0]).get('ok'):
        return json.loads(reports[0])
    if p.returncode or len(reports) != 1:
        raise RuntimeError('YOUTUBE_DATABASE_TASK_FAILED')
    result = json.loads(reports[0])
    if backup:
        if not (backup / '@.done.json').is_file():
            raise RuntimeError()
        hashes = {}
        for path in backup.iterdir():
            if not path.is_file() or path.is_symlink():
                raise RuntimeError()
            path.chmod(0o600)
            hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        backup.chmod(0o700)
        with (backup / 'verified-sha256.json').open('x') as output:
            json.dump(hashes, output)
        (backup / 'verified-sha256.json').chmod(0o600)
        result.update(backup=str(backup), files=len(hashes), restoreRehearsal=False)
    return result


if __name__ == '__main__':
    try:
        print(json.dumps(execute(json.load(sys.stdin))))
    except Exception:
        print(json.dumps({'ok': False, 'code': 'YOUTUBE_DATABASE_TASK_FAILED', 'partialArtifactsPreserved': True}))
        sys.exit(1)
