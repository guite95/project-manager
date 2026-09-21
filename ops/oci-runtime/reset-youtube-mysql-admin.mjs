// Operator-only credential recovery. Never put password values in argv or output.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readCredentialInput } from './credential-input.mjs';

const target = 'ocid1.mysqldbsystem.oc1.ap-chuncheon-1.aaaaaaaa6tcxsmmgpncdf5zkfdazz7m766hdukyysrkunq7fqbqmqnegw5ja';
const host = 'devukmysql.mysqlfree.vcn12042259.oraclevcn.com';
function run(command, args, input, timeout=60000) {
  const result = spawnSync(command,args,{input,encoding:'utf8',timeout,maxBuffer:65536});
  if(result.status!==0){
    let diagnostic='OPERATOR_COMMAND_FAILED';
    if(/"status"\s*:\s*412/.test(result.stderr??''))diagnostic='OCI_PRECONDITION_FAILED';
    try{const safe=JSON.parse(result.stdout);if(['MYSQL_ADMIN_AUTH_FAILED','MYSQL_ADMIN_TLS_FAILED','MYSQL_ADMIN_CHECK_FAILED'].includes(safe.code))diagnostic=safe.code;}catch{}
    throw new Error(diagnostic);
  }
  return result.stdout;
}
function sshArgs(config, command) {
  const key=config.identity_file?.replace(/^~(?=\/)/,homedir());
  if(!/^[A-Za-z0-9][A-Za-z0-9.:-]*$/.test(config.host??'')||!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(config.user??'')||!Number.isInteger(Number(config.port))||!key?.startsWith('/'))throw new Error();
  return ['-T','-i',key,'-p',String(config.port),'-o','IdentitiesOnly=yes','-o','BatchMode=yes',
    '-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${join(homedir(),'.ssh/known_hosts')}`,
    '-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',`${config.user}@${config.host}`,command];
}
const remote = String.raw`
import sys,json,subprocess,resource,yaml
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
try:
 data=json.load(sys.stdin)
 c=json.loads(subprocess.check_output(['docker','inspect','youtube-sync-backend-1']))[0]
 env=dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
 conf=yaml.safe_load(open('/home/ubuntu/.config/youtube-sync/db/application.yml'))
 source=conf['spring']['datasource']
 if env.get('DB_HOST')!=data['host'] or env.get('DB_NAME')!='youtube_sync' or env.get('DB_USER')==data['user']:raise RuntimeError()
 if source.get('username') or source.get('password') or 'VERIFY_IDENTITY' not in source['url']:raise RuntimeError()
 if not c['State']['Running'] or c['State'].get('Health',{}).get('Status')!='healthy':raise RuntimeError()
 if data['mode']=='preflight':
  print(json.dumps({'ok':True,'appUsesSeparateIdentity':True,'privateEndpointMatches':True,'backendHealthy':True}));sys.exit(0)
 options={'scheme':'mysql','host':data['host'],'port':3306,'user':data['user'],'password':data['password'],
  'ssl-mode':'VERIFY_IDENTITY','ssl-ca':'/home/ubuntu/.local/share/youtube-sync-migration/ca.pem'}
 code="import sys,json; data=json.load(sys.stdin); s=mysql.get_session(data); tls=s.run_sql(\"SHOW SESSION STATUS LIKE 'Ssl_cipher'\").fetch_one()[1]; one=s.run_sql('SELECT 1').fetch_one()[0]; s.close(); print(json.dumps({'ok':one==1 and bool(tls),'tlsVerified':bool(tls)}))"
 p=subprocess.run(['/home/ubuntu/.local/share/youtube-sync-migration/tools/mysql-shell-26.7.1-linux-glibc2.28-arm-64bit/bin/mysqlsh',
  '--no-defaults','--py','--quiet-start=2','--no-wizard','--log-file=/dev/null','--log-sql=off','--execute',code],
  input=json.dumps(options),capture_output=True,text=True,timeout=30)
 if p.returncode:
  code='MYSQL_ADMIN_AUTH_FAILED' if 'Access denied' in p.stderr+p.stdout else 'MYSQL_ADMIN_TLS_FAILED' if 'SSL' in p.stderr+p.stdout else 'MYSQL_ADMIN_CHECK_FAILED'
  print(json.dumps({'ok':False,'code':code}));sys.exit(1)
 print(json.dumps(json.loads(p.stdout)))
except Exception:print(json.dumps({'ok':False,'code':'MYSQL_ADMIN_CHECK_FAILED'}));sys.exit(1)
`;
const register = String.raw`
import sys,json,base64,oci
try:
 data=json.load(sys.stdin);r=data['resources'];cfg=oci.config.from_file();cfg['region']=r['region']
 client=oci.vault.VaultsClient(cfg,retry_strategy=oci.retry.NoneRetryStrategy(),timeout=(10,30))
 bundles=oci.secrets.SecretsClient(cfg,retry_strategy=oci.retry.NoneRetryStrategy(),timeout=(10,30))
 name='oci-mysql-administrator-password'
 old=[x for x in oci.pagination.list_call_get_all_results(client.list_secrets,compartment_id=r['compartmentId']).data if x.secret_name==name]
 if len(old)>1:raise RuntimeError()
 if old:
  secret=old[0]
  if secret.vault_id!=r['vaultId'] or secret.lifecycle_state!='ACTIVE':raise RuntimeError()
 else:
  content=oci.vault.models.Base64SecretContentDetails(content=base64.b64encode(data['password'].encode()).decode(),stage='CURRENT')
  secret=client.create_secret(oci.vault.models.CreateSecretDetails(compartment_id=r['compartmentId'],vault_id=r['vaultId'],key_id=r['keyId'],secret_name=name,secret_content=content)).data
  secret=oci.wait_until(client,client.get_secret(secret.id),'lifecycle_state','ACTIVE',max_interval_seconds=3,max_wait_seconds=90).data
 bundle=bundles.get_secret_bundle(secret.id,version_number=1).data
 if bundle.version_number!=1 or 'CURRENT' not in bundle.stages or base64.b64decode(bundle.secret_bundle_content.content).decode()!=data['password']:raise RuntimeError()
 print(json.dumps({'ok':True,'secretId':secret.id,'versionNumber':1,'vmIamGranted':False}))
except Exception:print(json.dumps({'ok':False,'code':'ADMIN_SECRET_REGISTRATION_FAILED'}));sys.exit(1)
`;
const keychain = String.raw`
import ctypes,json,sys,subprocess
try:
 d=json.load(sys.stdin);service=d['service'].encode();account=d['account'].encode();password=d['password'].encode()
 sec=ctypes.CDLL('/System/Library/Frameworks/Security.framework/Security');cf=ctypes.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
 find=sec.SecKeychainFindGenericPassword;find.restype=ctypes.c_int32
 find.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_char_p,ctypes.c_uint32,ctypes.c_char_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.POINTER(ctypes.c_void_p)]
 item=ctypes.c_void_p();status=find(None,len(service),service,len(account),account,None,None,ctypes.byref(item))
 if status!=0:raise RuntimeError()
 try:
  update=sec.SecKeychainItemModifyAttributesAndData;update.restype=ctypes.c_int32
  update.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_uint32,ctypes.c_void_p]
  if update(item,None,len(password),ctypes.c_char_p(password))!=0:raise RuntimeError()
 finally:
  cf.CFRelease.argtypes=[ctypes.c_void_p];cf.CFRelease(item)
 check=subprocess.run(['security','find-generic-password','-s',d['service'],'-a',d['account'],'-w'],capture_output=True,timeout=30)
 if check.returncode!=0 or check.stdout.rstrip(b'\n')!=password:raise RuntimeError()
 print(json.dumps({'ok':True,'keychainUpdated':True,'readbackVerified':True}))
except Exception:print(json.dumps({'ok':False,'code':'KEYCHAIN_UPDATE_FAILED'}));sys.exit(1)
`;

async function main() {
  const mode=process.argv[2]??'--check';
  if(!['--check','--apply','--verify','--sync-keychain'].includes(mode)||process.argv.length>3)throw new Error();
  const {credentials,report}=await readCredentialInput('.private/oci-vault-credentials.json');
  if(!report.ok)throw new Error();
  const config=JSON.parse(readFileSync(join(homedir(),'.config/oci-mysql-free/config.json'),'utf8'));
  if(config.dbSystemId!==target||config.region!=='ap-chuncheon-1'||config.ipAddress!=='10.0.1.158'||!/^[A-Za-z_][A-Za-z0-9_-]{0,31}$/.test(config.adminUsername??'')||config.keychainService!=='oci-mysql-free:dev-uk-mysql-free')throw new Error();
  const password=credentials.infrastructure_admins.mysql_oci_admin.new_password;
  const ssh=JSON.parse(readFileSync(join(homedir(),'.config/oci-ssh/config.json'),'utf8'));
  const command="sudo -n python3 -c '"+remote.replaceAll("'","'\\''")+"'";
  const verify = (mode) => {
    const payload=Buffer.from(JSON.stringify({mode,host,user:config.adminUsername,...(mode==='verify'?{password}:{})}));
    try{const r=JSON.parse(run('ssh',sshArgs(ssh,command),payload));if(!r.ok)throw new Error();return r;}finally{payload.fill(0);}
  };
  if(mode==='--verify'){console.log(JSON.stringify(verify('verify')));return;}
  const preflight=verify('preflight');
  if(mode==='--sync-keychain'){
    verify('verify');
    const payload=Buffer.from(JSON.stringify({service:config.keychainService,account:config.adminUsername,password}));
    try{console.log(run('python3',['-c',keychain],payload).trim());}finally{payload.fill(0);}
    return;
  }
  const info=JSON.parse(run('oci',['mysql','db-system','get','--region',config.region,'--db-system-id',target]));
  if(info.data?.['lifecycle-state']!=='ACTIVE'||!info.etag||!info.data.endpoints.some(e=>e.hostname===host&&e['ip-address']==='10.0.1.158'))throw new Error();
  if(mode==='--check'){console.log(JSON.stringify({...preflight,active:true,inputValidated:true,applied:false}));return;}
  const python=readFileSync('/opt/homebrew/bin/oci','utf8').split('\n')[0].replace(/^#!/,'');
  if(!/^\/opt\/homebrew\/Cellar\/oci-cli\/[^/]+\/libexec\/bin\/python[0-9.]*$/.test(python))throw new Error();
  let payload=Buffer.from(JSON.stringify({resources:JSON.parse(readFileSync(new URL('./vault-resources.json',import.meta.url),'utf8')),password}));
  let vault;
  try{vault=JSON.parse(run(python,['-c',register],payload,150000));if(!vault.ok)throw new Error();}finally{payload.fill(0);}
  console.log(JSON.stringify({phase:'vault',...vault}));
  // Vault creation can take time; an automatic backup may update the DB ETag.
  // Re-read immediately before the guarded update instead of reusing that snapshot.
  const fresh=JSON.parse(run('oci',['mysql','db-system','get','--region',config.region,'--db-system-id',target]));
  if(fresh.data?.['lifecycle-state']!=='ACTIVE'||!fresh.etag||!fresh.data.endpoints.some(e=>e.hostname===host&&e['ip-address']==='10.0.1.158'))throw new Error();
  payload=Buffer.from(JSON.stringify({dbSystemId:target,adminPassword:password,ifMatch:fresh.etag}));
  // A failed/ambiguous update is never retried blindly. Reconcile work requests first.
  let response;const requestId=randomUUID();
  try{const raw=run('oci',['mysql','db-system','update','--region',config.region,'--no-retry','--request-id',requestId,'--from-json','file:///dev/stdin','--force'],payload,90000);response=raw.trim()?JSON.parse(raw):{};}
  catch(error){console.log(JSON.stringify({ok:false,code:error.message==='OCI_PRECONDITION_FAILED'?'OCI_PRECONDITION_FAILED':'MYSQL_ADMIN_RESET_SUBMISSION_UNCERTAIN',requestId,reconcileBeforeRetry:true}));process.exitCode=1;return;}
  finally{payload.fill(0);}
  const id=response['opc-work-request-id'];
  if(id!==undefined&&(typeof id!=='string'||!id.startsWith('ocid1.mysqlworkrequest.')))throw new Error();
  console.log(JSON.stringify({ok:true,phase:'submitted',dbSystemId:target,requestId,workRequestId:id??null,secretId:vault.secretId,appCredentialsChanged:false,loginVerificationRequired:true}));
}
main().catch(error=>{console.log(JSON.stringify({ok:false,code:'MYSQL_ADMIN_OPERATOR_FAILED',diagnostic:['MYSQL_ADMIN_AUTH_FAILED','MYSQL_ADMIN_TLS_FAILED','MYSQL_ADMIN_CHECK_FAILED','OPERATOR_COMMAND_FAILED'].includes(error.message)?error.message:'VALIDATION'}));process.exitCode=1;});
