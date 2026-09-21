// Host preparation only. Never merges Ilchul, switches traffic, or changes app containers.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {operatorSsh} from './youtube-operator.mjs';

const program=String.raw`
import json,sys,os,stat,grp,subprocess,datetime,shutil,base64
phase='input'
try:
 d=json.load(sys.stdin);root='/opt/project-management-runtime/current/ops/oci-runtime'
 def run(args):
  p=subprocess.run(args,capture_output=True,timeout=180)
  if p.returncode:raise RuntimeError()
  return p.stdout
 def directory(path,mode):
  if not os.path.lexists(path):os.mkdir(path,mode)
  s=os.lstat(path)
  assert stat.S_ISDIR(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode)==mode
 def write_new(path,content,mode):
  if os.path.lexists(path):
   s=os.lstat(path)
   assert stat.S_ISREG(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode)==mode and open(path,'rb').read()==content
   return
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
  with os.fdopen(fd,'wb') as out:out.write(content)
 phase='group'
 gid=d['manifests']['ilchul-backend']['gid']
 try:assert grp.getgrnam('ilchul-secrets').gr_gid==gid
 except KeyError:
  try:grp.getgrgid(gid);raise RuntimeError()
  except KeyError:run(['groupadd','--system','--gid',str(gid),'ilchul-secrets'])
 directory('/etc/ilchul',0o755)
 for service,m in d['manifests'].items():
  assert m['service']==service
  write_new('/etc/oci-service-secrets/'+service+'.json',(json.dumps(m)+'\n').encode(),0o600)
 phase='source-artifacts'
 for name,value in d['artifacts'].items():
  target={'scripts/vault_preflight.py':'/usr/local/sbin/ilchul-vault-preflight','infrastructure/vault/ilchul-vault-migrate.py':'/usr/local/sbin/ilchul-vault-migrate',
   'docker-compose.blue.yml':'/etc/ilchul/docker-compose.blue.yml','docker-compose.green.yml':'/etc/ilchul/docker-compose.green.yml'}[name]
  write_new(target,base64.b64decode(value),0o750 if target.startswith('/usr/local/sbin/') else 0o644)
 write_new('/etc/ilchul/host-artifact-source.json',(json.dumps({'repository':'BEGAE4/ilchul','revision':d['revision'],'appDeployed':False})+'\n').encode(),0o644)
 phase='public-settings'
 color=open('/home/begae/ilchul/current_environment.txt').read().strip();assert color in ['blue','green']
 app=json.loads(run(['docker','inspect','ilchul-backend-'+color]))[0]
 env=dict(x.split('=',1) for x in app['Config']['Env'] if '=' in x)
 keys=['OAUTH_GOOGLE_CLIENT_ID','OAUTH_GOOGLE_REDIRECT_URI','OAUTH_KAKAO_REDIRECT_URI','OAUTH_NAVER_CLIENT_ID','OAUTH_NAVER_REDIRECT_URI','FRONTEND_BASE_URL']
 values={k:env[k] for k in keys}
 if env.get('ADMIN_USERNAME'):values['ADMIN_USERNAME']=env['ADMIN_USERNAME']
 values.update(MYSQL_DRIVER='com.mysql.cj.jdbc.Driver',MYSQL_URL='mysql:3306',MYSQL_DATABASE='ilchul_db',REDIS_DB='redis',BACKEND_SERVER_PORT='8081',FRONTEND_SERVER_PORT='3001',ILCHUL_SECRET_GID=str(gid),
  STORAGE_ENDPOINT=env.get('STORAGE_ENDPOINT') or env['CLOUD_AWS_S3_ENDPOINT'],STORAGE_BUCKET_NAME=env.get('STORAGE_BUCKET_NAME') or env['CLOUD_AWS_S3_BUCKET'],
  STORAGE_REGION=env.get('STORAGE_REGION') or env['CLOUD_AWS_S3_REGION'],STORAGE_PUBLIC_URL=env.get('STORAGE_PUBLIC_URL') or env.get('CLOUD_AWS_S3_PUBLIC_BASE_URL',''))
 import importlib.machinery,importlib.util
 loader=importlib.machinery.SourceFileLoader('preflight','/usr/local/sbin/ilchul-vault-preflight');spec=importlib.util.spec_from_loader(loader.name,loader);pf=importlib.util.module_from_spec(spec);loader.exec_module(pf)
 text=''.join(k+'='+v+'\n' for k,v in sorted(values.items()));pf.validate_public_env(text)
 write_new('/etc/ilchul/runtime-public.env',text.encode(),0o644)
 # Deliberately fail closed until all remaining evidence has been collected.
 write_new('/etc/ilchul/vault-cutover.json',(json.dumps({'contractVersion':1,'checks':{k:False for k in sorted(pf.CHECKS)}})+'\n').encode(),0o600)
 phase='units'
 units=['ilchul-secrets.service','redis-admin-secrets.service','ilchul-runtime.service','ilchul-redis-acl.service','ilchul-redis-acl.timer']
 for name in units:write_new('/etc/systemd/system/'+name,open(root+'/'+name,'rb').read(),0o644)
 run(['systemd-analyze','verify']+[root+'/'+u for u in units]);run(['systemctl','daemon-reload'])
 phase='publishers'
 run(['systemctl','enable','ilchul-secrets.service','redis-admin-secrets.service','ilchul-runtime.service'])
 run(['systemctl','start','ilchul-secrets.service','redis-admin-secrets.service'])
 phase='redis'
 run(['python3',root+'/ilchul-redis-acl.py'])
 run(['python3',root+'/youtube-redis-acl.py'])
 old='/etc/systemd/system/youtube-redis-acl.service';new=open(root+'/youtube-redis-acl.service','rb').read()
 if open(old,'rb').read()!=new:
  directory('/var/backups/ilchul-vault',0o700)
  backup='/var/backups/ilchul-vault/youtube-redis-acl-before.service'
  write_new(backup,open(old,'rb').read(),0o600)
  temporary=old+'.ilchul-next';write_new(temporary,new,0o644);os.replace(temporary,old)
 run(['systemctl','daemon-reload'])
 run(['systemctl','enable','--now','ilchul-redis-acl.timer'])
 run(['systemctl','start','ilchul-runtime.service'])
 print(json.dumps({'ok':True,'publishersReady':True,'redisReady':True,'runtimeSupervisorEnabled':True,'publicSettingsReady':True,'readinessGateClosed':True,'appContainersChanged':False}))
except Exception:
 print(json.dumps({'ok':False,'code':'ILCHUL_INSTALL_FAILED','phase':phase,'partialArtifactsPreserved':True}))
`;
try{
 const repo='/Users/janguk/uk/ilchul',revision=execFileSync('git',['rev-parse','origin/security/vault-cutover-20260921'],{cwd:repo,encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(revision))throw new Error();
 const paths=['scripts/vault_preflight.py','infrastructure/vault/ilchul-vault-migrate.py','docker-compose.blue.yml','docker-compose.green.yml'];
 const artifacts=Object.fromEntries(paths.map(p=>[p,execFileSync('git',['show',revision+':'+p],{cwd:repo}).toString('base64')]));
 const manifests=Object.fromEntries(['ilchul-backend','ilchul-migration','redis-admin'].map(s=>[s,JSON.parse(readFileSync(new URL('./vault-manifest.'+s+'.json',import.meta.url),'utf8'))]));
 const result=operatorSsh(program,{revision,artifacts,manifests});console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}catch{console.log(JSON.stringify({ok:false,code:'ILCHUL_INSTALL_FAILED',partialArtifactsPreserved:true}));process.exitCode=1;}
