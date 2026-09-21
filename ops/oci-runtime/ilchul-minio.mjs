import {readFileSync} from 'node:fs';
import {readCredentialInput} from './credential-input.mjs';
import {operatorSsh} from './youtube-operator.mjs';
const wrapper=String.raw`
import json,subprocess,sys,resource
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
d=json.load(sys.stdin)
p=subprocess.run(['/opt/ilchul-vault-tools/bin/python','-c',d['program']],input=json.dumps(d['data']),text=True,capture_output=True,timeout=150)
try:r=json.loads(p.stdout)
except Exception:r={'ok':False,'code':'ILCHUL_MINIO_FAILED','partialArtifactsPreserved':True}
print(json.dumps(r))
`;
try{
 const mode=process.argv[2];if(!['inspect','provision','verify'].includes(mode)||process.argv.length!==3)throw new Error();
 const {credentials:c,report}=await readCredentialInput('.private/oci-vault-credentials.json');if(!report.ok)throw new Error();
 const r=operatorSsh(wrapper,{program:readFileSync(new URL('./ilchul-minio.py',import.meta.url),'utf8'),data:{mode,account:c.service_accounts.ilchul_minio}});
 console.log(JSON.stringify(r));if(!r.ok)process.exitCode=1;
}catch{console.log(JSON.stringify({ok:false,code:'ILCHUL_MINIO_FAILED',partialArtifactsPreserved:true}));process.exitCode=1;}
