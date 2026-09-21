import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import { readCredentialInput } from './credential-input.mjs';
import { register } from './register-flight-secrets.mjs';
import { operatorSsh } from './youtube-operator.mjs';

export function buildIlchulSecretEntries(c, existing) {
 try {
  const runtime={};
  const retained={JWT_SECRET_KEY:c.application_signing_secrets.ilchul_jwt.new_secret};
  for(const [key,name] of Object.entries({GOOGLE_API_KEY:'ilchul_google_api',TOUR_API_KEY:'ilchul_tour_api',ANTHROPIC_API_KEY:'ilchul_anthropic_api',OAUTH_GOOGLE_CLIENT_SECRET:'ilchul_google_oauth_client',OAUTH_KAKAO_CLIENT_SECRET:'ilchul_kakao_oauth_client',OAUTH_NAVER_CLIENT_SECRET:'ilchul_naver_oauth_client'}))retained[key]=c.external_reissuance[name].new_secret;
  for(const [key,value] of Object.entries(retained)) {if(!value||value!==existing[key])throw new Error();runtime[key]=value;}
  for(const key of ['ADMIN_PASSWORD','KAKAO_REST_API_KEY']){if(!existing[key])throw new Error();runtime[key]=existing[key];}
  for(const [user,pass,name] of [['MYSQL_USER','MYSQL_PASSWORD','ilchul_mysql_runtime'],['REDIS_USERNAME','REDIS_PASSWORD','ilchul_redis']]){
   runtime[user]=c.service_accounts[name].new_username;runtime[pass]=c.service_accounts[name].new_password;
  }
  runtime.AWS_ACCESS_KEY_ID=c.service_accounts.ilchul_minio.new_access_key;
  runtime.AWS_SECRET_ACCESS_KEY=c.service_accounts.ilchul_minio.new_secret_key;
  const m=c.service_accounts.ilchul_mysql_migration,a=c.infrastructure_admins.redis;
  const entries=[{name:'ilchul-backend-config',value:JSON.stringify(runtime)},
   {name:'ilchul-migration-config',value:JSON.stringify({MYSQL_USER:m.new_username,MYSQL_PASSWORD:m.new_password})},
   {name:'redis-host-admin-config',value:JSON.stringify({REDIS_USERNAME:a.new_username,REDIS_PASSWORD:a.new_password})}];
  if(Object.values(runtime).some(v=>typeof v!=='string'||!v)||entries.some(e=>Buffer.byteLength(e.value)>25000))throw new Error();
  return entries;
 }catch{throw new Error('ILCHUL_SECRET_INPUT_INVALID');}
}
const existingProgram=String.raw`
import json,subprocess,pathlib,resource
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
color=pathlib.Path('/home/begae/ilchul/current_environment.txt').read_text().strip()
assert color in ['blue','green']
c=json.loads(subprocess.check_output(['docker','inspect','ilchul-backend-'+color]))[0]
assert c['State']['Running']
env=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
assert env.get('ILCHUL_RUNTIME_MODE')!='vault'
keys=['JWT_SECRET_KEY','ADMIN_PASSWORD','KAKAO_REST_API_KEY','GOOGLE_API_KEY','TOUR_API_KEY','ANTHROPIC_API_KEY','OAUTH_GOOGLE_CLIENT_SECRET','OAUTH_KAKAO_CLIENT_SECRET','OAUTH_NAVER_CLIENT_SECRET']
print(json.dumps({k:env[k] for k in keys}))
`;
async function main(){
 const mode=process.argv[2]??'--check';if(!['--check','--apply'].includes(mode)||process.argv.length>3)throw new Error();
 const {credentials,report}=await readCredentialInput('.private/oci-vault-credentials.json');if(!report.ok)throw new Error();
 const entries=buildIlchulSecretEntries(credentials,operatorSsh(existingProgram,{}));
 if(mode==='--check'){console.log(JSON.stringify({ok:true,names:entries.map(e=>e.name),retainedSigningAndApiValues:true}));return;}
 const python=readFileSync('/opt/homebrew/bin/oci','utf8').split('\n')[0].replace(/^#!/,'');
 if(!/^\/opt\/homebrew\/Cellar\/oci-cli\/[^/]+\/libexec\/bin\/python[0-9.]*$/.test(python))throw new Error();
 const payload=Buffer.from(JSON.stringify({resources:JSON.parse(readFileSync(new URL('./vault-resources.json',import.meta.url),'utf8')),entries}));
 let r;try{r=spawnSync(python,['-c',register],{input:payload,encoding:'utf8',timeout:480000,maxBuffer:32768});}finally{payload.fill(0);}
 const result=JSON.parse(r.stdout||'{}');if(r.status!==0||!result.ok)throw new Error();
 console.log(JSON.stringify({ok:true,secrets:result.secrets.map(s=>({name:s.name,id:s.id,versionNumber:s.versionNumber,created:s.created})),appChanged:false}));
}
if(isMainModule(import.meta.url))main().catch(()=>{console.log(JSON.stringify({ok:false,code:'ILCHUL_SECRET_REGISTRATION_FAILED',partialCreationsMayExist:true}));process.exitCode=1;});
