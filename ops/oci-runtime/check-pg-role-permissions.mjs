// Explicit isolated test runner; fixture credentials and code only, no real input file.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
const image=process.argv[2];
if(!/^project-management:[a-f0-9]{40}$/.test(image??''))throw new Error('IMMUTABLE_PM_IMAGE_REQUIRED');
const files=['ops/oci-runtime/pg-roles.mjs','ops/oci-runtime/pg-roles.integration.mjs','lib/test-database.ts'];
const payload=Buffer.from(JSON.stringify(Object.fromEntries(files.map(path=>[path,readFileSync(path).toString('base64')])))).toString('base64');
const script=`sudo -n python3 - <<'PY'
import os,json,subprocess,tempfile,time,uuid,pathlib,base64,shutil
name='pm-role-check-'+uuid.uuid4().hex[:12]; job=name+'-job'; directory=None; owns=False; owns_job=False; ok=False
def run(args,timeout=30):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError()
 return p.stdout
try:
 image='${image}';run(['docker','image','inspect',image])
 pg_image='postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
 run(['docker','image','inspect',pg_image])
 directory=tempfile.mkdtemp(prefix=name+'-',dir='/run')
 for path,data in json.loads(base64.b64decode('${payload}')).items():
  target=pathlib.Path(directory)/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(base64.b64decode(data))
 os.symlink('/app/node_modules',directory+'/node_modules')
 owns=True
 run(['docker','run','-d','--name',name,'--pull','never','--network','none','--memory','512m','--cpus','0.5','--pids-limit','128','--log-driver','none',
  '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=512m','-e','POSTGRES_DB=project_management_test','-e','POSTGRES_PASSWORD=FixtureAdminOnly1!',
  '-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',pg_image])
 ready=False
 for attempt in range(30):
  p=subprocess.run(['docker','exec',name,'pg_isready','-U','postgres','-d','project_management_test'],capture_output=True)
  if p.returncode==0:ready=True;break
  time.sleep(1)
 if not ready:raise RuntimeError()
 owns_job=True
 run(['docker','run','--rm','--name',job,'--pull','never','--network','container:'+name,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','256m','--cpus','0.5','--pids-limit','128','--log-driver','none','--ulimit','core=0','--tmpfs','/tmp:rw,nosuid,nodev,size=32m',
  '--mount','type=bind,src='+directory+',dst=/verification,readonly','-e','PM_ISOLATED_ROLE_TEST=1','--entrypoint','node',image,
  '--experimental-strip-types','--test','/verification/ops/oci-runtime/pg-roles.integration.mjs'],60)
 ok=True
except Exception:pass
finally:
 safe=True
 for owned,container in [(owns_job,job),(owns,name)]:
  if owned:
   subprocess.run(['docker','rm','-f','-v',container],capture_output=True,timeout=30)
   p=subprocess.run(['docker','inspect',container],capture_output=True,text=True,timeout=30)
   safe=safe and p.returncode==1 and p.stdout.strip()=='[]'
 if safe and directory:shutil.rmtree(directory)
 print(json.dumps({'ok':ok and safe,'productionDatabaseUsed':False,'fixtureRemoved':safe}))
 raise SystemExit(0 if ok and safe else 1)
PY
`;
const result=spawnSync('python3',[resolve(homedir(),'.codex/skills/oci-ssh/scripts/oci_ssh.py'),'--script'],{input:script,encoding:'utf8',timeout:180000,maxBuffer:16384});
try{const report=JSON.parse(result.stdout);console.log(JSON.stringify(report));process.exitCode=result.status===0&&report.ok===true?0:1;}
catch{console.log('ROLE_PERMISSION_CHECK_FAILED');process.exitCode=1;}
