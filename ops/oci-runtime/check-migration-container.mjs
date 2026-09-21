// Explicit operator-only integration check. No production DB, Vault or credentials.
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { migrationContainerArgs } from './migrate-pm.mjs';

const image = process.argv[2];
const args = migrationContainerArgs(image, 'pm-migration-fixture');
const payload = Buffer.from(JSON.stringify(args)).toString('base64');
const script = `sudo -n python3 - <<'PY'
import os, json, base64, subprocess, tempfile, time, uuid, shutil
args=json.loads(base64.b64decode('${payload}'))
prefix='pm-migration-check-'+uuid.uuid4().hex[:12]
database=prefix+'-db'; migration=prefix+'-job'
directory=None; owns_db=False; owns_job=False
def run(command,timeout=30):
    p=subprocess.run(command,capture_output=True,text=True,timeout=timeout)
    if p.returncode: raise RuntimeError('SANDBOX_COMMAND_FAILED')
    return p.stdout
try:
    if os.getuid()!=0: raise RuntimeError()
    run(['docker','image','inspect','${image}'])
    # Existing local image only; never pull a tag or attach to shared-infra.
    pg_image='postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
    run(['docker','image','inspect',pg_image])
    directory=tempfile.mkdtemp(prefix=prefix+'-',dir='/run')
    secret=directory+'/secret'; os.mkdir(secret,0o750); os.mkdir(secret+'/g-aaaaaa',0o750)
    fixture_url='postgresql://postgres:FixtureMigrationOnly1!@localhost:5432/project_management_test'
    fd=os.open(secret+'/g-aaaaaa/DATABASE_URL',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o640)
    with os.fdopen(fd,'w') as f: f.write(fixture_url)
    os.symlink('g-aaaaaa',secret+'/current')
    owns_db=True
    run(['docker','run','-d','--name',database,'--pull','never','--network','none',
        '--memory','512m','--cpus','0.5','--pids-limit','128','--log-driver','none',
        '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=512m',
        '-e','POSTGRES_DB=project_management_test','-e','POSTGRES_PASSWORD=FixtureMigrationOnly1!',
        '-e','POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',pg_image])
    ready=False
    for attempt in range(30):
        p=subprocess.run(['docker','exec',database,'pg_isready','-U','postgres','-d','project_management_test'],capture_output=True)
        if p.returncode==0: ready=True; break
        time.sleep(1)
    if not ready: raise RuntimeError()
    args[args.index('--name')+1]=migration
    args[args.index('--network')+1]='container:'+database
    args[args.index('--mount')+1]='type=bind,src='+secret+',dst=/run/project-management-migration,readonly'
    # No shared DB network or real credential can enter this guarded fixture.
    if 'shared-infra' in args or not fixture_url.endswith('/project_management_test'): raise RuntimeError()
    owns_job=True
    for attempt in range(2): run(['docker']+args,180)
    count=run(['docker','exec',database,'psql','-U','postgres','-d','project_management_test','-Atc',
        'SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL']).strip()
    if count!='7': raise RuntimeError()
    print(json.dumps({'ok':True,'schemaMigrations':7,'repeatDeploy':True,'readonlyRootfs':True,'productionDatabaseUsed':False}))
except Exception:
    print(json.dumps({'ok':False,'code':'MIGRATION_SANDBOX_FAILED','productionDatabaseUsed':False}))
    raise SystemExit(1)
finally:
    safe=True
    for owned,name in [(owns_job,migration),(owns_db,database)]:
        if owned:
            subprocess.run(['docker','rm','-f','-v',name],capture_output=True,timeout=30)
            p=subprocess.run(['docker','inspect',name],capture_output=True,text=True,timeout=30)
            safe=safe and p.returncode==1 and p.stdout.strip()=='[]'
    if safe and directory: shutil.rmtree(directory)
    if not safe: raise SystemExit(1)
PY
`;
const result = spawnSync('python3', [resolve(homedir(), '.codex/skills/oci-ssh/scripts/oci_ssh.py'), '--script'], {
  input: script, encoding: 'utf8', timeout: 420000, maxBuffer: 32768,
});
try {
  const report = JSON.parse(result.stdout);
  const ok=result.status===0 && report.ok===true && report.productionDatabaseUsed===false && report.schemaMigrations===7;
  console.log(JSON.stringify({ok,schemaMigrations:ok?7:undefined,repeatDeploy:ok,readonlyRootfs:ok,productionDatabaseUsed:false}));
  process.exitCode=ok?0:1;
} catch {console.log('MIGRATION_SANDBOX_FAILED');process.exitCode=1;}
