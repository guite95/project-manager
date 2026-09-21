"""Additive local MySQL accounts. Input through personal SSH stdin; no secret output."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import sys

def literal(value):
 if not isinstance(value,str) or not value or any(c in value for c in '\r\n\0'):raise ValueError()
 return "'"+value.replace('\\','\\\\').replace("'","\\'")+"'"

def account(user):
 if not re.fullmatch('[A-Za-z_][A-Za-z0-9_-]{0,31}',user) or user=='root':raise ValueError()
 return literal(user)+"@'172.27.%'"

def grants(user,kind):
 rights='SELECT,INSERT,UPDATE,DELETE'
 if kind=='migration':rights+=',CREATE,ALTER,DROP,INDEX,REFERENCES,CREATE VIEW,SHOW VIEW,TRIGGER,EVENT'
 elif kind!='runtime':raise ValueError()
 return 'GRANT '+rights+' ON `ilchul_db`.* TO '+account(user)+';'

def query(sql):
 p=subprocess.run(['docker','exec','-i','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --batch --skip-column-names'],input=sql,text=True,capture_output=True,timeout=60)
 if p.returncode:raise RuntimeError()
 return p.stdout.strip()

def backup():
 root=Path('/var/backups/ilchul-vault');root.mkdir(mode=0o700,exist_ok=True)
 s=root.lstat()
 if not root.is_dir() or root.is_symlink() or s.st_uid or s.st_mode&0o777!=0o700:raise ValueError()
 target=root/('prepare-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.sql.gz')
 args=['docker','exec','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF --routines --events --triggers ilchul_db']
 with target.open('xb') as raw, gzip.GzipFile(fileobj=raw,mode='wb') as out:
  p=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  try:
   while chunk:=p.stdout.read(1024*1024):out.write(chunk)
   if p.wait(timeout=30):raise RuntimeError()
  finally:
   if p.poll() is None:p.kill();p.wait()
 size=0
 with gzip.open(target,'rb') as source:
  while chunk:=source.read(1024*1024):size+=len(chunk)
 if size<100:raise ValueError()
 digest=hashlib.sha256(target.read_bytes()).hexdigest()
 target.with_suffix('.sha256').write_text(digest+'  '+target.name+'\n')
 return str(target)

def main(data):
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
 assert os.geteuid()==0
 if data['mode']=='backup':return {'ok':True,'backup':backup(),'verifiedGzip':True}
 assert data['mode'] in ['inspect','provision']
 assert query('SELECT @@general_log,@@slow_query_log;')=='0\t0'
 assert 'NO_BACKSLASH_ESCAPES' not in query('SELECT @@sql_mode;')
 accounts=data['accounts'];assert set(accounts)=={'runtime','migration'}
 assert len({a['new_username'] for a in accounts.values()})==2
 collisions={}
 for kind,a in accounts.items():
  account(a['new_username']);literal(a['new_password'])
  collisions[kind]=int(query('SELECT COUNT(*) FROM mysql.user WHERE User='+literal(a['new_username'])+';'))
 if data['mode']=='inspect':return {'ok':True,'accountCollisions':collisions,'tables':int(query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ilchul_db';"))}
 # Refuse to adopt or overwrite any pre-existing principal, including a partial prior attempt.
 assert not any(collisions.values())
 backup_path=backup()
 before=query("SELECT User,Host FROM mysql.user ORDER BY User,Host;")
 Path(backup_path+'.accounts-before').write_text(before+'\n')
 for kind,a in accounts.items():
  query('CREATE USER '+account(a['new_username'])+' IDENTIFIED BY '+literal(a['new_password'])+';'+grants(a['new_username'],kind))
  actual=query('SHOW GRANTS FOR '+account(a['new_username'])+';')
  if 'GRANT OPTION' in actual or 'ALL PRIVILEGES' in actual:raise ValueError()
  allowed=('SELECT','INSERT','UPDATE','DELETE') if kind=='runtime' else ('SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','INDEX','REFERENCES','CREATE VIEW','SHOW VIEW','TRIGGER','EVENT')
  permissions=query("SELECT PRIVILEGE_TYPE FROM information_schema.schema_privileges WHERE GRANTEE="+literal(account(a['new_username']))+" AND TABLE_SCHEMA='ilchul_db' ORDER BY PRIVILEGE_TYPE;").splitlines()
  if set(permissions)!=set(allowed):raise ValueError()
 return {'ok':True,'accountsCreated':2,'runtimeCrudOnly':True,'migrationSchemaOnly':True,'backup':backup_path,'existingAccountsUnchanged':True}

if __name__=='__main__':
 try:print(json.dumps(main(json.load(sys.stdin))))
 except Exception:
  print(json.dumps({'ok':False,'code':'ILCHUL_DATABASE_FAILED','partialArtifactsPreserved':True}));sys.exit(1)
