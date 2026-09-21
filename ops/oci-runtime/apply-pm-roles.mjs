// Operator entrypoint: keep both new passwords exclusively in protected input / SSH stdin.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import { readCredentialInput } from './credential-input.mjs';

async function main() {
  const mode=process.argv[2]??'--check';
  if(!['--check','--apply'].includes(mode)||process.argv.length>3)throw new Error();
  const {credentials,report}=await readCredentialInput('.private/oci-vault-credentials.json');
  if(!report.ok)throw new Error();
  const payload=Buffer.from(JSON.stringify(Object.fromEntries(['runtime','migration'].map(kind=>{
    const account=credentials.service_accounts[`project_management_postgres_${kind}`];
    return [kind,{username:account.new_username,password:account.new_password}];
  }))));
  try {
    const config=JSON.parse(readFileSync(join(homedir(),'.config/oci-ssh/config.json'),'utf8'));
    const port=Number(config.port), key=config.identity_file?.replace(/^~(?=\/)/,homedir());
    if(!/^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(config.host??'')||!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(config.user??'')||!Number.isInteger(port)||port<1||port>65535||!key?.startsWith('/'))throw new Error();
    // Mirrors the oci-ssh skill's personal identity and strict known-host settings.
    // Direct SSH is required here because --command intentionally disables stdin.
    const args=['-T','-i',key,'-p',String(port),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${join(homedir(),'.ssh/known_hosts')}`,'-o','ConnectTimeout=10','-o','ConnectionAttempts=1','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',`${config.user}@${config.host}`,
      `sudo -n sh -c 'ulimit -c 0; exec /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/provision-pm-roles.mjs ${mode}'`];
    const result=spawnSync('ssh',args,{input:payload,encoding:'utf8',timeout:180000,maxBuffer:32768});
    if(result.status!==0)throw new Error();
    const output=JSON.parse(result.stdout);
    if(output.ok!==true)throw new Error();
    console.log(JSON.stringify({ok:true,available:output.available,created:output.created,runtimeDdl:output.runtimeDdl,connectionsVerified:output.connectionsVerified,backup:output.backup,appCredentialChanged:output.appCredentialChanged,applied:mode==='--apply'}));
  } finally {payload.fill(0);}
}
if(isMainModule(import.meta.url)) {
  main().catch(()=>{console.log('PM_ROLE_OPERATOR_FAILED');process.exitCode=1;});
}
