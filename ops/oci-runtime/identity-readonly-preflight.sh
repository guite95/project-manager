# Send via oci-ssh --script. Read-only; inspect output is reduced in memory.
sudo python3 - <<'PY'
import json, subprocess, shutil, os, pwd, grp
def run(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=20)
    return p.returncode, p.stdout.strip()
out = {}
out['compose_version'] = run(['docker','compose','version','--short'])[1]
out['native_node_present'] = shutil.which('node') is not None
out['run_filesystem'] = run(['findmnt','-n','-o','FSTYPE','/run'])[1]
out['swap_active'] = bool(run(['swapon','--noheadings','--show=NAME'])[1])
try: out['runtime_group_present'] = bool(grp.getgrnam('pm-runtime'))
except KeyError: out['runtime_group_present'] = False
out['units'] = {name:run(['systemctl','is-active',name])[1] for name in ['project-management-wif.timer','project-management-object-broker.service','project-management-google-token.timer']}
items = json.loads(run(['docker','inspect','project-management','flight-backend','ilchul-backend-blue','youtube-sync-backend-1','youtube-sync-media-service-1'])[1])
out['apps'] = []
for c in items:
    env = dict(x.split('=',1) for x in c['Config']['Env'] if '=' in x)
    out['apps'].append({'name':c['Name'].lstrip('/'),'running':c['State']['Running'],
       'health':c['State'].get('Health',{}).get('Status','not-configured'),
       'wif_mounted':any(m['Destination'].startswith('/run/project-management-wif') for m in c.get('Mounts',[])),
       'broker_enabled':env.get('OCI_STORAGE_AUTH')=='broker',
       'token_file_configured':bool(env.get('GOOGLE_ACCESS_TOKEN_FILE'))})
out['free_root_bytes'] = shutil.disk_usage('/').free
print(json.dumps(out))
PY
