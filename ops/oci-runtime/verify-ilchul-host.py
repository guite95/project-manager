"""Operator-only live checks; no application deployment or production schema writes."""
import gzip
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import resource
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT=Path('/opt/project-management-runtime/current/ops/oci-runtime')
def load(name,path):
 loader=importlib.machinery.SourceFileLoader(name,str(path));spec=importlib.util.spec_from_loader(name,loader)
 module=importlib.util.module_from_spec(spec);loader.exec_module(module);return module
def run(args,**kwargs):
 return subprocess.run(args,capture_output=True,timeout=180,**kwargs)

def main():
 assert os.geteuid()==0
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
 shared=load('acl',ROOT/'youtube-redis-acl.py')
 assert run(['/opt/node24/bin/node',str(ROOT/'vault-runtime.mjs'),'--ilchul-migration']).returncode==0
 runtime=shared.secret('ilchul-backend');migration=shared.secret('ilchul-migration')
 def sql(values,statement):
  command='IFS= read -r user; IFS= read -r pass; MYSQL_PWD="$pass" exec mysql -h mysql -u "$user" --batch --skip-column-names ilchul_db'
  return run(['docker','exec','-i','mysql','sh','-c',command],input=values['MYSQL_USER']+'\n'+values['MYSQL_PASSWORD']+'\n'+statement,text=True)
 for values in [runtime,migration]:
  p=sql(values,"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ilchul_db';")
  assert p.returncode==0 and int(p.stdout.strip())==18
 assert sql(runtime,'CREATE TEMPORARY TABLE vault_permission_probe(id INT);').returncode!=0
 assert sql(runtime,'SELECT COUNT(*) FROM mysql.user;').returncode!=0
 assert sql(migration,'SELECT COUNT(*) FROM mysql.user;').returncode!=0
 print(json.dumps({'phase':'mysql-auth','ok':True,'runtimeDdlDenied':True,'systemUsersDenied':True}),flush=True)
 mig=load('migration','/usr/local/sbin/ilchul-vault-migrate')
 options_dir=Path(tempfile.mkdtemp(prefix='verify-backup-',dir=mig.SECRET_ROOT))
 name='ilchul-backup-verify-'+uuid.uuid4().hex[:12]
 before=set(mig.BACKUP_ROOT.glob('*.sql.gz'))
 try:
  (options_dir/'client.cnf').write_text(mig.mysql_options(migration))
  mig.backup(options_dir,name)
 finally:
  mig.remove_container(name)
  shutil.rmtree(options_dir)
 created=set(mig.BACKUP_ROOT.glob('*.sql.gz'))-before;assert len(created)==1
 backup=created.pop()
 print(json.dumps({'phase':'migration-backup','ok':True,'backup':str(backup)}),flush=True)
 image=json.loads(run(['docker','inspect','mysql']).stdout)[0]['Config']['Image']
 restore='ilchul-restore-verify-'+uuid.uuid4().hex[:12]
 args=['docker','run','-d','--name',restore,'--network=none','--user=999:999','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
  '--log-driver=none','--memory=1g','--cpus=1','--pids-limit=256','--ulimit=core=0',
  '--tmpfs=/var/lib/mysql:rw,nosuid,nodev,size=512m,uid=999,gid=999,mode=0700',
  '--tmpfs=/var/run/mysqld:rw,nosuid,nodev,size=16m,uid=999,gid=999,mode=0700',
  '--tmpfs=/tmp:rw,nosuid,nodev,size=64m,mode=1777','-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes',image,'--skip-networking']
 try:
  assert run(args).returncode==0
  deadline=time.monotonic()+120
  while True:
   p=run(['docker','exec',restore,'sh','-c','test "$(cat /proc/1/comm)" = mysqld && mysqladmin ping -uroot --silent'])
   if p.returncode==0:break
   assert time.monotonic()<deadline;time.sleep(1)
  assert run(['docker','exec',restore,'mysql','-uroot','-e','CREATE DATABASE ilchul_db;']).returncode==0
  with gzip.open(backup,'rb') as source:
   assert run(['docker','exec','-i',restore,'mysql','-uroot','ilchul_db'],input=source.read()).returncode==0
  query="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ilchul_db'; SELECT MAX(version) FROM ilchul_db.flyway_schema_history WHERE success=1;"
  p=run(['docker','exec',restore,'mysql','-uroot','--batch','--skip-column-names','-e',query])
  assert p.returncode==0 and p.stdout.decode().splitlines()==['18','260920120100']
  print(json.dumps({'phase':'isolated-restore','ok':True,'tables':18,'latestMigration':'260920120100','network':'none','storage':'tmpfs'}),flush=True)
 finally:
  mig.remove_container(restore)
 print(json.dumps({'phase':'complete','ok':True,'appContainersChanged':False,'temporaryRestoreRemoved':True}),flush=True)

if __name__=='__main__':
 try:main()
 except Exception:
  print(json.dumps({'ok':False,'code':'ILCHUL_HOST_VERIFY_FAILED','partialArtifactsPreserved':True}));raise SystemExit(1)
