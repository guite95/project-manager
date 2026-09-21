import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rm, rmdir, statfs } from 'node:fs/promises';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import { readServiceFile } from './service-readiness.mjs';

const secretRoot='/run/oci-service-secrets/youtube-migration';
export function youtubeMigrationArgs(image,name){
  if(!/^ghcr\.io\/guite95\/youtube-sync-backend:[a-f0-9]{40}$/.test(image??'')||!/^youtube-migration-[a-z0-9-]+$/.test(name??''))throw new Error('YOUTUBE_MIGRATION_ARGUMENTS');
  return ['run','--rm','--name',name,'--pull','never','--network','shared-infra','--user','0:0',
    '--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m','--cpus','1','--log-driver','none','--ulimit','core=0',
    '--tmpfs','/tmp:rw,nosuid,nodev,size=64m',
    '--mount',`type=bind,src=${secretRoot},dst=${secretRoot},readonly`,
    '--mount','type=bind,src=/home/ubuntu/.config/youtube-sync/db,dst=/run/secrets/youtube-sync-db,readonly',
    '--env','JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError',image,'--vault-migrate'];
}
function run(command,args,timeout=30000){
  const r=spawnSync(command,args,{encoding:'utf8',timeout,maxBuffer:1024*1024});
  if(r.status!==0)throw new Error('YOUTUBE_MIGRATION_FAILED');return r.stdout;
}
async function main(){
  const image=process.argv[2],name=`youtube-migration-${randomUUID()}`,args=youtubeMigrationArgs(image,name);
  if(process.getuid()!==0||process.argv.length!==3||(await statfs('/run')).type!==0x01021994)throw new Error();
  const lock='/run/youtube-vault-migration.lock';let locked=false,ownsContainer=false,ownsSecrets=false;
  try{
    await mkdir(lock,{mode:0o700});locked=true;
    const exists=spawnSync('/usr/bin/docker',['container','inspect',name],{encoding:'utf8',timeout:30000});
    if(exists.status!==1||exists.stdout?.trim()!=='[]')throw new Error();
    if(await lstat(secretRoot).catch(e=>{if(e.code!=='ENOENT')throw e;}))throw new Error();
    run('/usr/bin/docker',['image','inspect',image]);
    run('/usr/bin/python3',['/opt/project-management-runtime/current/ops/oci-runtime/imds-guard.py','--check']);
    ownsSecrets=true;
    run('/opt/node24/bin/node',['/opt/project-management-runtime/current/ops/oci-runtime/vault-runtime.mjs','--youtube-migration'],180000);
    const c=JSON.parse(await readServiceFile('youtube-migration','CONFIG_JSON'));
    if(Object.keys(c).sort().join(',')!=='DB_PASSWORD,DB_USER,RUNTIME_USER'||!Object.values(c).every(v=>typeof v==='string'&&v))throw new Error();
    run('/usr/bin/python3',['/opt/project-management-runtime/current/ops/oci-runtime/youtube-backup.py'],180000);
    ownsContainer=true;run('/usr/bin/docker',args,180000);
  }finally{
    if(ownsContainer){
      spawnSync('/usr/bin/docker',['rm','-f',name],{stdio:'pipe',timeout:30000});
      const left=spawnSync('/usr/bin/docker',['container','inspect',name],{encoding:'utf8',timeout:30000});
      if(left.status!==1||left.stdout?.trim()!=='[]')throw new Error();
    }
    if(ownsSecrets){
      const s=await lstat(secretRoot).catch(e=>{if(e.code!=='ENOENT')throw e;});
      if(s){if(!s.isDirectory()||s.uid!==0||s.gid!==0||(s.mode&0o777)!==0o750)throw new Error();await rm(secretRoot,{recursive:true});}
    }
    if(locked)await rmdir(lock);
  }
  process.stdout.write('YOUTUBE_MIGRATION_SUCCEEDED\n');
}
if(isMainModule(import.meta.url))main().catch(()=>{process.stderr.write('YOUTUBE_MIGRATION_FAILED\n');process.exitCode=1;});
