# Operator-only restore rehearsal of the already protected pre-cutover snapshot.
# Never attach this fixture to the production DB network or publish a host port.
sudo -n python3 - <<'PY'
import os, json, subprocess, tempfile, uuid, time, pathlib, stat, shutil
backup='/var/backups/oci-vault-migration/pm-20260921T003525353826Z.dump'
name='pm-restore-check-'+uuid.uuid4().hex[:12]
directory=None; owns=False; phase='preflight'; report=None; started=time.monotonic()
def run(args,timeout=30):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode:
        detail=p.stderr.lower()
        code='COMMAND_FAILED'
        for pattern,label in [('no space left','CAPACITY'),('out of memory','MEMORY'),('permission denied','PERMISSION')]:
            if pattern in detail: code=label;break
        raise RuntimeError(code)
    return p.stdout
try:
    s=os.lstat(backup)
    if os.getuid()!=0 or not stat.S_ISREG(s.st_mode) or s.st_uid!=0 or stat.S_IMODE(s.st_mode)!=0o600: raise RuntimeError()
    memory=next(int(line.split()[1])*1024 for line in open('/proc/meminfo') if line.startswith('MemAvailable:'))
    if memory<10*1024**3: raise RuntimeError()
    image='postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
    run(['docker','image','inspect',image])
    directory=tempfile.mkdtemp(prefix=name+'-',dir='/run')
    # Installed extension binaries are copied read-only from the identical PG image.
    extension='/usr/local/share/postgresql/extension/'
    files=run(['docker','exec','postgresql','find',extension,'-maxdepth','1','-type','f','-name','vector*']).splitlines()
    if not files or any(not p.startswith(extension+'vector') or '/' in p[len(extension):] for p in files): raise RuntimeError()
    files.append('/usr/local/lib/postgresql/vector.so')
    for path in files: run(['docker','cp','postgresql:'+path,directory+'/'+pathlib.Path(path).name])
    phase='isolated_database'; owns=True
    run(['docker','run','-d','--name',name,'--pull','never','--network','none',
        '--memory','5g','--cpus','2','--pids-limit','128','--log-driver','none',
        '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=4g',
        '--mount','type=bind,src='+backup+',dst=/input/pm.dump,readonly',
        '-e','POSTGRES_DB=project_management_test','-e','POSTGRES_PASSWORD=FixtureRestoreOnly1!',image])
    for path in files: run(['docker','cp',directory+'/'+pathlib.Path(path).name,name+':'+path])
    ready=False
    for attempt in range(30):
        p=subprocess.run(['docker','exec',name,'pg_isready','-U','postgres','-d','project_management_test'],capture_output=True)
        if p.returncode==0: ready=True; break
        time.sleep(1)
    if not ready: raise RuntimeError()
    container=json.loads(run(['docker','inspect',name]))[0]
    if container['HostConfig']['NetworkMode']!='none' or container['HostConfig'].get('PortBindings'): raise RuntimeError()
    phase='restore'
    run(['docker','exec',name,'pg_restore','--exit-on-error','--no-owner','--no-privileges','-U','postgres','-d','project_management_test','/input/pm.dump'],1200)
    phase='verify'
    sql="SELECT json_build_object('tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'migrations',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'vector',(SELECT extversion FROM pg_extension WHERE extname='vector'),'database_ok',current_database()='project_management_test')"
    result=json.loads(run(['docker','exec',name,'psql','-U','postgres','-d','project_management_test','-Atc',sql]))
    if result!={'tables':28,'migrations':7,'vector':'0.8.1','database_ok':True}: raise RuntimeError()
    report={'ok':True,'tables':28,'migrations':7,'vector':'0.8.1','productionDatabaseModified':False,'originalBackupPreserved':True}
except Exception as error:
    reason='TIMEOUT' if isinstance(error,subprocess.TimeoutExpired) else str(error)
    if reason not in ['TIMEOUT','COMMAND_FAILED','CAPACITY','MEMORY','PERMISSION']:reason='VALIDATION'
    report={'ok':False,'phase':phase,'reason':reason,'productionDatabaseModified':False,'originalBackupPreserved':True}
finally:
    safe=True
    if owns:
        subprocess.run(['docker','rm','-f','-v',name],capture_output=True,timeout=30)
        p=subprocess.run(['docker','inspect',name],capture_output=True,text=True,timeout=30)
        safe=p.returncode==1 and p.stdout.strip()=='[]'
    if safe and directory: shutil.rmtree(directory)
    report['fixtureRemoved']=safe
    report['elapsedSeconds']=round(time.monotonic()-started)
    if not safe: report['ok']=False
    print(json.dumps(report))
    raise SystemExit(0 if report['ok'] else 1)
PY
