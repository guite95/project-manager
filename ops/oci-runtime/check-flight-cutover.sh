# Read-only live verification. Only booleans/status are emitted, never values.
sudo -n python3 - <<'PY'
import json,os,subprocess
phase='inspect'
def run(args,timeout=30):
    result=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if result.returncode:raise RuntimeError()
    return result.stdout
try:
    app=json.loads(run(['docker','inspect','flight-backend']))[0]
    names={v.split('=',1)[0] for v in app['Config']['Env']}
    forbidden={'DATABASE_URL','DB_USER','DB_PASSWORD','SECRET_KEY','SMTP_PASSWORD','GOOGLE_CLIENT_CONFIG','KAKAO_CLIENT_SECRET','KAKAO_REST_API_KEY','MINIO_ROOT_USER','MINIO_ROOT_PASSWORD','FLIGHT_MIGRATION_SECRET_DIRECTORY'}
    checks={'running':app['State']['Running'],'file_mode':'FLIGHT_SECRET_DIRECTORY' in names,
      'secret_environment_absent':not bool(names&forbidden),'docker_restart_disabled':app['HostConfig']['RestartPolicy']['Name']=='no',
      'read_only_root':app['HostConfig']['ReadonlyRootfs'],
      'runtime_mount_read_only':any(m['Source']=='/run/oci-service-secrets/flight' and m['Destination']=='/run/secrets/flight' and not m['RW'] for m in app['Mounts']),
      'migration_mount_absent':not any('migration' in m['Source'] for m in app['Mounts']),
      'migration_files_absent':not os.path.lexists('/run/oci-service-secrets/flight-migration')}
    phase='systemd'
    for unit in ['flight-secrets.service','flight-runtime.service','project-management-runtime.service']:
        checks[unit+'_active']=run(['systemctl','is-active',unit]).strip()=='active'
    for unit in ['flight-secrets.service','flight-runtime.service']:
        checks[unit+'_enabled']=run(['systemctl','is-enabled',unit]).strip()=='enabled'
    phase='imds_guard'
    run(['python3','/opt/project-management-runtime/current/ops/oci-runtime/imds-guard.py','--check'])
    checks['imds_guard']=True
    code='''
import json,urllib.request
from runtime_secrets import database_url
from sqlalchemy import create_engine,text
from sqlalchemy.engine import make_url
url=make_url(database_url()); engine=create_engine(url)
with engine.connect() as c:
 r=c.execute(text("SELECT current_database()='flight-db' AS database_ok,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,has_schema_privilege(current_user,'public','CREATE') AS ddl,has_table_privilege(current_user,'public.alembic_version','INSERT') AS migration_write FROM pg_roles WHERE rolname=current_user")).mappings().one()
 ok=r['database_ok'] and not any(r[k] for k in ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls','ddl','migration_write'])
 ok=ok and c.execute(text('SELECT current_user')).scalar()==url.username
 c.execute(text('SELECT id FROM users LIMIT 0'))
print(json.dumps({'dedicated_runtime_role':ok}))
'''
    phase='database_role'
    checks.update(json.loads(run(['docker','exec','flight-backend','python','-c',code])))
    for path in ['/','/api/static/airlines','/api/static/airports']:
        phase='http_'+path
        # Use the same HTTP client as CI; the public edge returns 403 to urllib.
        checks['http_'+path]=run(['curl','--fail','--silent','--output','/dev/null','--max-time','15','--write-out','%{http_code}','https://adogs-ticket.shop'+path]).strip()=='200'
    print(json.dumps({'ok':all(checks.values()),'checks':checks}))
    raise SystemExit(0 if all(checks.values()) else 1)
except Exception:
    print(json.dumps({'ok':False,'code':'FLIGHT_LIVE_CHECK_FAILED','phase':phase}));raise SystemExit(1)
PY
