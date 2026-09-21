import { readFileSync } from 'node:fs';
import { operatorSsh } from './youtube-operator.mjs';

const program=String.raw`
import json,sys,os,stat,grp,subprocess,datetime,shutil
phase='input'
try:
 data=json.load(sys.stdin);root='/opt/project-management-runtime/current/ops/oci-runtime'
 def run(args,timeout=180):
  p=subprocess.run(args,capture_output=True,timeout=timeout)
  if p.returncode:raise RuntimeError()
  return p.stdout
 def write_new(path,content,mode):
  if os.path.lexists(path):
   s=os.lstat(path)
   if not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=mode or open(path,'rb').read()!=content:raise RuntimeError()
   return
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
  with os.fdopen(fd,'wb') as out:out.write(content)
 for service in ['backend','media','migration']:
  m=data[service]
  if m['service']!='youtube-'+service:raise RuntimeError()
  if service=='migration':assert m['gid']==0
  else:assert m['gid']==grp.getgrnam('youtube-'+service+'-secrets').gr_gid
  write_new('/etc/oci-service-secrets/youtube-'+service+'.json',(json.dumps(m)+'\n').encode(),0o600)
 phase='units'
 units=['youtube-secrets@.service','youtube-runtime@.service','youtube-redis-acl.service','youtube-redis-acl.timer']
 for name in units:write_new('/etc/systemd/system/'+name,open(root+'/'+name,'rb').read(),0o644)
 run(['systemd-analyze','verify']+[root+'/'+u for u in units]);run(['systemctl','daemon-reload'])
 phase='publishers'
 run(['systemctl','enable','youtube-secrets@backend.service','youtube-secrets@media.service'])
 run(['systemctl','start','youtube-secrets@backend.service','youtube-secrets@media.service'])
 for service in ['backend','media']:run(['/opt/node24/bin/node',root+'/service-readiness.mjs','youtube-'+service])
 phase='redis-acl'
 run(['/usr/bin/python3',root+'/youtube-redis-acl.py'])
 phase='nonsecret-config'
 app=json.loads(run(['docker','inspect','youtube-sync-backend-1']))[0]
 env=dict(x.split('=',1) for x in app['Config']['Env'] if '=' in x)
 media=json.loads(run(['docker','inspect','youtube-sync-media-service-1']))[0];me=dict(x.split('=',1) for x in media['Config']['Env'] if '=' in x)
 keys=['DB_HOST','DB_PORT','DB_NAME','REDIS_HOST','REDIS_PORT','FRONTEND_ORIGINS','MEDIA_SERVICE_URL','ROOM_RUNTIME_KEY_PREFIX','ROOM_RUNTIME_TTL','ROOM_WEBSOCKET_MAX_MESSAGE_BYTES','ROOM_SYNC_PULSE_INTERVAL_MS','MEDIA_TOKEN_ISSUER','MEDIA_TOKEN_TTL','JWT_ISSUER','JWT_ACCESS_TTL','JWT_REFRESH_TTL','ACCESS_TOKEN_COOKIE','REFRESH_TOKEN_COOKIE']
 values={k:env[k] for k in keys if k in env}
 for k in ['MEDIA_RESOLVE_CACHE_TTL_SECONDS','MEDIA_RESOLVE_EXPIRY_SAFETY_SECONDS']:
  if k in me:values[k]=me[k]
 values.update(MEDIA_REDIS_DB=me.get('REDIS_DB','0'),DB_CONFIG_HOST_DIR='/home/ubuntu/.config/youtube-sync/db',YOUTUBE_BACKEND_SECRET_GID=str(data['backend']['gid']),YOUTUBE_MEDIA_SECRET_GID=str(data['media']['gid']),SHARED_INFRA_NETWORK='shared-infra',IMAGE_TAG=app['Config']['Image'].split(':')[-1])
 for component in ['FRONTEND','BACKEND','MEDIA_SERVICE']:values['IMAGE_NAME_'+component]='ghcr.io/guite95/youtube-sync-'+component.lower().replace('_','-')
 if any('\n' in v or '\r' in v or "'" in v or '\x00' in v for v in values.values()):raise RuntimeError()
 conf=''.join(k+"='"+v+"'\n" for k,v in sorted(values.items()))
 target='/home/ubuntu/youtube-sync/production.env'
 write_new(target,conf.encode(),0o644)
 phase='configuration-backup'
 backup='/var/backups/youtube-sync-vault/configuration-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');os.mkdir(backup,0o700)
 for name in ['.env','docker-compose.deploy.yml']:
  source='/home/ubuntu/youtube-sync/'+name
  if os.path.isfile(source):shutil.copyfile(source,backup+'/'+name);os.chmod(backup+'/'+name,0o600)
 print(json.dumps({'ok':True,'publishersReady':True,'aclReady':True,'nonsecretConfigReady':True,'configurationBackup':backup,'appContainersChanged':False}))
except Exception:
 print(json.dumps({'ok':False,'code':'YOUTUBE_INSTALL_FAILED','phase':phase,'partialArtifactsPreserved':True}))
 sys.exit(1)
`;
try{
 const manifests=Object.fromEntries(['backend','media','migration'].map(s=>[s,JSON.parse(readFileSync(new URL('./vault-manifest.youtube-'+s+'.json',import.meta.url),'utf8'))]));
 const result=operatorSsh(program,manifests);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}catch{console.log(JSON.stringify({ok:false,code:'YOUTUBE_INSTALL_FAILED',partialArtifactsPreserved:true}));process.exitCode=1;}
