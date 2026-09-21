"""Read-only live assertions. Output booleans only, never Docker Env or secret contents."""
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import sys
import urllib.request

checks = {}


def run(args, timeout=15):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if p.returncode: raise RuntimeError()
    return p.stdout


try:
    revision = json.load(sys.stdin)['revision']
    if os.getuid() != 0 or not re.fullmatch('[a-f0-9]{40}', revision): raise RuntimeError()
    forbidden = {'DB_USER', 'DB_PASSWORD', 'REDIS_USERNAME', 'REDIS_PASSWORD', 'JWT_ACCESS_SECRET',
                 'JWT_REFRESH_SECRET', 'MEDIA_TOKEN_SECRET', 'BOOTSTRAP_ADMIN_PASSWORD', 'YOUTUBE_COOKIES_FILE'}
    for component, service in [('backend', 'backend'), ('media-service', 'media')]:
        name = 'youtube-sync-'+component+'-1'
        c = json.loads(run(['docker', 'inspect', name]))[0]
        checks[service+'Healthy'] = c['State']['Running'] and c['State'].get('Health', {}).get('Status') == 'healthy'
        checks[service+'ImmutableImage'] = c['Config']['Image'] == 'ghcr.io/guite95/youtube-sync-'+component+':'+revision
        env = dict(x.split('=', 1) for x in c['Config']['Env'] if '=' in x)
        checks[service+'NoSecretEnv'] = not forbidden.intersection(env)
        checks[service+'Nonroot'] = run(['docker', 'exec', name, 'id', '-u']).strip() != '0'
        checks[service+'ReadonlyRoot'] = c['HostConfig']['ReadonlyRootfs'] and 'ALL' in c['HostConfig']['CapDrop']
        checks[service+'SystemdRestartGate'] = c['HostConfig']['RestartPolicy']['Name'] == 'no'
        allowed = {'/run/oci-service-secrets/youtube-'+service}
        if service == 'backend': allowed.add('/run/secrets/youtube-sync-db')
        mounts=[m for m in c['Mounts'] if m['Type']!='tmpfs']
        checks[service+'OwnReadonlyMounts'] = {m['Destination'] for m in mounts} == allowed and all(not m['RW'] for m in mounts)
        for kind in ['secrets', 'runtime']:
            unit='youtube-'+kind+'@'+service+'.service'
            checks[service+kind+'ActiveEnabled'] = run(['systemctl', 'is-active', unit]).strip() == 'active' and run(['systemctl', 'is-enabled', unit]).strip() == 'enabled'
    checks['aclTimerActiveEnabled'] = run(['systemctl','is-active','youtube-redis-acl.timer']).strip() == 'active' and run(['systemctl','is-enabled','youtube-redis-acl.timer']).strip() == 'enabled'
    root='/opt/project-management-runtime/current/ops/oci-runtime'
    acl=runpy.run_path(root+'/youtube-redis-acl.py')
    checks['scopedRedisUsers'] = acl['reconcile'](True)['ok']
    checks['migrationFilesAbsent'] = not Path('/run/oci-service-secrets/youtube-migration').exists()
    checks['migrationContainersAbsent'] = not run(['docker','ps','-aq','--filter','name=^youtube-migration-']).strip()
    run(['/usr/bin/python3',root+'/imds-guard.py','--check'])
    checks['metadataFirewall'] = True
    checks['backendReady'] = json.load(urllib.request.urlopen('http://127.0.0.1:8080/api/health/ready',timeout=10))['status']=='UP'
    checks['mediaReady'] = json.load(urllib.request.urlopen('http://127.0.0.1:8000/health/ready',timeout=10))['status']=='UP'
    for label,url in [('publicReady','https://song.dev-uk.shop/api/health/ready'),('frontendReady','https://song.dev-uk.shop/')]:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=15) as response:
            checks[label]=response.status==200 and (label!='publicReady' or json.load(response)['status']=='UP')
    request=urllib.request.Request('https://song.dev-uk.shop/api/v1/auth/csrf',headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request,timeout=15) as response:checks['csrfRoute']=response.status==200
except Exception:
    checks['checkerCompleted']=False
else:
    checks['checkerCompleted']=True
print(json.dumps({'ok':all(checks.values()),'code':'YOUTUBE_CUTOVER_CHECK','checks':checks,'redisDefaultNopassException':True,'interactivePlaybackVerified':False,'vmRebootVerified':False}))
if not all(checks.values()):sys.exit(1)
