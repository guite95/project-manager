"""Recover only the active Vault color. Legacy/running containers are untouched."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT='/opt/project-management-runtime/current/ops/oci-runtime'

def needs_recovery(container):
 env=dict(v.split('=',1) for v in container['Config']['Env'] if '=' in v)
 if env.get('ILCHUL_RUNTIME_MODE')!='vault' or container['State']['Running']:return False
 if not re.fullmatch(r'ghcr\.io/begae4/ilchul-backend:[a-f0-9]{40}',container['Config']['Image']):raise ValueError()
 return True

def run(args,**kwargs):
 return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=180,**kwargs).stdout

def tick():
 color=Path('/home/begae/ilchul/current_environment.txt').read_text().strip()
 if color not in ['blue','green']:raise ValueError()
 backend='ilchul-backend-'+color;frontend='ilchul-frontend-'+color
 b,f=json.loads(run(['docker','inspect',backend,frontend]))
 if not needs_recovery(b):
  # Do not recreate a healthy backend just because the frontend exited.
  env=dict(v.split('=',1) for v in b['Config']['Env'] if '=' in v)
  if env.get('ILCHUL_RUNTIME_MODE')=='vault' and b['State']['Running'] and not f['State']['Running']:
   run(['docker','start',frontend])
  return
 # The supervisor must remain alive when initial Vault dependencies fail at boot.
 # Retry the publishers here; never start the application until they succeed.
 run(['systemctl','start','ilchul-secrets.service','redis-admin-secrets.service'])
 run(['/usr/local/sbin/ilchul-vault-preflight'])
 run(['python3',ROOT+'/imds-guard.py','--check'])
 run(['python3',ROOT+'/ilchul-redis-acl.py'])
 # Publish first; a Vault failure never starts a container with absent/old tmpfs mounts.
 run(['systemctl','reload','ilchul-secrets.service'])
 if not re.fullmatch(r'ghcr\.io/begae4/ilchul-frontend:[a-f0-9]{40}',f['Config']['Image']):raise ValueError()
 if Path('/home/begae/ilchul/current_environment.txt').read_text().strip()!=color:raise ValueError()
 env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','COMPOSE_ENV_FILES':'/etc/ilchul/runtime-public.env',
      'BACKEND_IMAGE':b['Config']['Image'],'FRONTEND_IMAGE':f['Config']['Image']}
 command=['docker','compose','--project-name','ilchul-recovery-'+color,'-f','/etc/ilchul/docker-compose.'+color+'.yml']
 # Existing containers belong to the deployment's compose project. Reuse its exact name.
 project=b['Config'].get('Labels',{}).get('com.docker.compose.project','')
 if not re.fullmatch('[a-z0-9][a-z0-9_-]{0,62}',project):raise ValueError()
 command[3]=project
 run(command+['up','-d','--no-deps','--force-recreate',backend],env=env,cwd='/etc/ilchul')
 if not f['State']['Running']:run(['docker','start',frontend])

if __name__=='__main__':
 if os.geteuid()!=0 or sys.argv[1:] not in ([],['--once']):sys.exit(1)
 while True:
  try:tick()
  except Exception:
   if sys.argv[1:]:sys.exit(1)
  if sys.argv[1:]:break
  time.sleep(10)
