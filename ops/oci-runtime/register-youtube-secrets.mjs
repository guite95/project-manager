import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import { readCredentialInput } from './credential-input.mjs';
import { register } from './register-flight-secrets.mjs';
import { operatorSsh } from './youtube-operator.mjs';

export function buildYoutubeSecretEntries(c, existing) {
  try {
    const backend={};
    for(const [name,key] of Object.entries({JWT_ACCESS_SECRET:'youtube_jwt_access',JWT_REFRESH_SECRET:'youtube_jwt_refresh',MEDIA_TOKEN_SECRET:'youtube_media_shared'})) {
      const value=c.application_signing_secrets[key].new_secret;
      if(!value||value!==existing.backend[name]||(name==='MEDIA_TOKEN_SECRET'&&value!==existing.media[name]))throw new Error();
      backend[name]=value;
    }
    for(const [prefix,key] of [['DB','youtube_mysql_runtime'],['REDIS','youtube_backend_redis']]){
      const account=c.service_accounts[key];backend[prefix==='DB'?'DB_USER':'REDIS_USERNAME']=account.new_username;backend[prefix+'_PASSWORD']=account.new_password;
    }
    const a=c.service_accounts.youtube_media_redis, m=c.service_accounts.youtube_mysql_migration;
    const media={REDIS_USERNAME:a.new_username,REDIS_PASSWORD:a.new_password,MEDIA_TOKEN_SECRET:backend.MEDIA_TOKEN_SECRET,YOUTUBE_COOKIES:existing.cookies};
    if(typeof media.YOUTUBE_COOKIES!=='string')throw new Error();
    const migration={DB_USER:m.new_username,DB_PASSWORD:m.new_password,RUNTIME_USER:backend.DB_USER};
    const entries=[{name:'youtube-backend-config',value:JSON.stringify(backend)},{name:'youtube-media-config',value:JSON.stringify(media)},{name:'youtube-migration-config',value:JSON.stringify(migration)}];
    if(entries.some(e=>Buffer.byteLength(e.value)>25000))throw new Error();
    return entries;
  }catch{throw new Error('YOUTUBE_SECRET_INPUT_INVALID');}
}
const existingProgram=String.raw`
import json,subprocess,os,stat
def env(name):
 c=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
 return c,dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
b,be=env('youtube-sync-backend-1');m,me=env('youtube-sync-media-service-1')
assert 'JWT_ACCESS_SECRET' in be and 'MEDIA_TOKEN_SECRET' in me
cookies='';p=me.get('YOUTUBE_COOKIES_FILE','')
if p:
 matches=[x for x in m['Mounts'] if p.startswith(x['Destination']+'/') and not x['RW']]
 assert len(matches)==1
 path=matches[0]['Source']+p[len(matches[0]['Destination']):];s=os.lstat(path)
 assert stat.S_ISREG(s.st_mode) and s.st_size<20000
 cookies=open(path).read()
print(json.dumps({'backend':{k:be[k] for k in ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','MEDIA_TOKEN_SECRET']},'media':{'MEDIA_TOKEN_SECRET':me['MEDIA_TOKEN_SECRET']},'cookies':cookies}))
`;
async function main(){
  const mode=process.argv[2]??'--check';if(!['--check','--apply'].includes(mode)||process.argv.length>3)throw new Error();
  const {credentials,report}=await readCredentialInput('.private/oci-vault-credentials.json');if(!report.ok)throw new Error();
  const entries=buildYoutubeSecretEntries(credentials,operatorSsh(existingProgram,{}));
  if(mode==='--check'){console.log(JSON.stringify({ok:true,names:entries.map(e=>e.name),retainedSigningAndCookies:true}));return;}
  const python=readFileSync('/opt/homebrew/bin/oci','utf8').split('\n')[0].replace(/^#!/,'');
  if(!/^\/opt\/homebrew\/Cellar\/oci-cli\/[^/]+\/libexec\/bin\/python[0-9.]*$/.test(python))throw new Error();
  const payload=Buffer.from(JSON.stringify({resources:JSON.parse(readFileSync(new URL('./vault-resources.json',import.meta.url),'utf8')),entries}));
  let result;try{result=spawnSync(python,['-c',register],{input:payload,encoding:'utf8',timeout:480000,maxBuffer:32768});}finally{payload.fill(0);}
  const r=JSON.parse(result.stdout||'{}');if(result.status!==0||!r.ok)throw new Error();
  console.log(JSON.stringify({ok:true,secrets:r.secrets.map(s=>({name:s.name,id:s.id,versionNumber:s.versionNumber,created:s.created})),vmIamGranted:false}));
}
if(isMainModule(import.meta.url))main().catch(()=>{console.log(JSON.stringify({ok:false,code:'YOUTUBE_SECRET_REGISTRATION_FAILED',partialCreationsMayExist:true}));process.exitCode=1;});
