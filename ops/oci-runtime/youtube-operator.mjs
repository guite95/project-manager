// Personal operator authentication only. No admin permission is granted to the VM.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readCredentialInput } from './credential-input.mjs';

export function operatorSsh(program, data) {
  const config=JSON.parse(readFileSync(join(homedir(),'.config/oci-ssh/config.json'),'utf8'));
  const key=config.identity_file?.replace(/^~(?=\/)/,homedir());
  if(!/^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(config.host??'')||!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(config.user??'')||!key?.startsWith('/'))throw new Error();
  const args=['-T','-i',key,'-p',String(config.port),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
    '-o',`UserKnownHostsFile=${join(homedir(),'.ssh/known_hosts')}`,'-o','ConnectTimeout=10',`${config.user}@${config.host}`,
    "sudo -n python3 -c '"+program.replaceAll("'","'\\''")+"'"];
  const payload=Buffer.from(JSON.stringify(data));
  try {
    const result=spawnSync('ssh',args,{input:payload,encoding:'utf8',timeout:210000,maxBuffer:131072});
    if(result.status!==0){
      try{const safe=JSON.parse(result.stdout);if(safe.ok===false&&/^YOUTUBE_[A-Z_]+$/.test(safe.code??''))return {ok:false,code:safe.code,...(typeof safe.phase==='string'&&/^[a-z-]+$/.test(safe.phase)?{phase:safe.phase}:{})};}catch{}
      throw new Error('YOUTUBE_OPERATOR_FAILED');
    }
    return JSON.parse(result.stdout);
  }finally{payload.fill(0);}
}

async function main(){
  const mode=process.argv[2];
  if(!['inspect','backup','provision','verify','retire'].includes(mode)||process.argv.length!==3)throw new Error();
  const {credentials:c,report}=await readCredentialInput('.private/oci-vault-credentials.json');if(!report.ok)throw new Error();
  const cfg=JSON.parse(readFileSync(join(homedir(),'.config/oci-mysql-free/config.json'),'utf8'));
  const data={mode,user:cfg.adminUsername,password:c.infrastructure_admins.mysql_oci_admin.new_password,
    accounts:{runtime:c.service_accounts.youtube_mysql_runtime,migration:c.service_accounts.youtube_mysql_migration}};
  const result=operatorSsh(readFileSync(new URL('./youtube-database.py',import.meta.url),'utf8'),data);
  console.log(JSON.stringify(result));
  if(!result.ok)process.exitCode=1;
}
if(process.argv[1]?.endsWith('/youtube-operator.mjs')) main().catch(()=>{console.log(JSON.stringify({ok:false,code:'YOUTUBE_OPERATOR_FAILED',partialArtifactsPreserved:true}));process.exitCode=1;});
