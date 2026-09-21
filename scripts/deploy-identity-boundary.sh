#!/bin/bash
set -euo pipefail
if [[ $# != 1 || ! "$1" =~ ^project-management:[a-f0-9]{40}$ ]]; then
  echo 'IMMUTABLE_PM_IMAGE_REQUIRED' >&2
  exit 2
fi
export APP_IMAGE="$1"
cd /home/ubuntu/project-management
exec 9>.deployment.lock
flock -n 9 || { echo 'PM_DEPLOYMENT_ALREADY_RUNNING' >&2; exit 1; }
export PM_RUNTIME_GID
PM_RUNTIME_GID=$(getent group pm-runtime | cut -d: -f3)
[[ "$PM_RUNTIME_GID" =~ ^[0-9]+$ ]]
export COMPOSE_FILE=docker-compose.yml:docker-compose.identity-boundary.yml
export PM_DEPLOYMENT_MODE
PM_DEPLOYMENT_MODE=$(sudo -n python3 scripts/prepare-identity-cutover.py --mode)
[[ "$PM_DEPLOYMENT_MODE" == identity || "$PM_DEPLOYMENT_MODE" == vault ]]
if [[ "$PM_DEPLOYMENT_MODE" == vault ]]; then
  export COMPOSE_FILE="$COMPOSE_FILE:docker-compose.vault.yml"
  sudo -n systemctl restart project-management-secrets.service
  sudo -n /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/vault-readiness.mjs
fi
sudo -n /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/identity-readiness.mjs "$PM_RUNTIME_GID"
python3 - <<'PY'
import os,json,subprocess
try:
    p=subprocess.run(['docker','compose','config','--format','json'],capture_output=True,text=True,check=True)
    app=json.loads(p.stdout)['services']['app']; env=app['environment']; mounts=app['volumes']
    expected={'/run/project-management-broker','/run/project-management-google'}
    if os.environ['PM_DEPLOYMENT_MODE']=='vault':
        expected.add('/run/oci-service-secrets/project-management')
        assert env.get('PM_SECRET_DIRECTORY')=='/run/oci-service-secrets/project-management'
        assert not any(key in env for key in ['DATABASE_URL','SESSION_SECRET','APP_PASSWORD_HASH','PM_MIGRATION_SECRET_DIRECTORY'])
        assert app.get('command')==['node','server.js']
    else:
        assert all(env.get(key) for key in ['DATABASE_URL','SESSION_SECRET','APP_PASSWORD_HASH'])
        assert 'PM_SECRET_DIRECTORY' not in env
    assert len(mounts)==len(expected) and {m['target'] for m in mounts}==expected
    assert all(m['source']==m['target'] and m['type']=='bind' and m.get('read_only') is True for m in mounts)
    assert env.get('OCI_STORAGE_AUTH')=='broker' and env.get('GOOGLE_APPLICATION_CREDENTIALS')==''
    assert env.get('GOOGLE_ACCESS_TOKEN_FILE')=='/run/project-management-google/access-token.json'
    assert app.get('group_add')==[os.environ['PM_RUNTIME_GID']] and app.get('restart')=='no'
except Exception:
    print('IDENTITY_COMPOSE_INVALID'); raise SystemExit(1)
PY
# This is before stopping/replacing the old app. Failure leaves it running.
if [[ "$PM_DEPLOYMENT_MODE" == vault ]]; then
  sudo -n /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/migrate-pm.mjs "$APP_IMAGE"
fi
# All readiness/config checks precede the interruption of the old container.
sudo -n python3 scripts/prepare-identity-cutover.py
sudo -n systemctl daemon-reload
sudo -n systemctl stop project-management-runtime.service
docker stop --time 30 project-management > /dev/null
sudo -n systemctl enable project-management-imds-guard.service project-management-runtime.service
sudo -n systemctl start project-management-imds-guard.service
sudo -n /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/identity-readiness.mjs "$PM_RUNTIME_GID"
docker compose up -d --no-build --pull never app
sudo -n systemctl start project-management-runtime.service
sudo -n systemctl is-active --quiet project-management-runtime.service
python3 - <<'PY'
import os,json,subprocess
try:
    c=json.loads(subprocess.run(['docker','inspect','project-management'],capture_output=True,text=True,check=True).stdout)[0]
    env=dict(item.split('=',1) for item in c['Config']['Env'] if '=' in item)
    assert c['HostConfig']['RestartPolicy']['Name']=='no'
    assert env.get('OCI_STORAGE_AUTH')=='broker' and not env.get('GOOGLE_APPLICATION_CREDENTIALS')
    expected={'/run/project-management-broker','/run/project-management-google'}
    if os.environ['PM_DEPLOYMENT_MODE']=='vault':
        expected.add('/run/oci-service-secrets/project-management')
        assert env.get('PM_SECRET_DIRECTORY')=='/run/oci-service-secrets/project-management'
        assert not any(key in env for key in ['DATABASE_URL','SESSION_SECRET','APP_PASSWORD_HASH','PM_MIGRATION_SECRET_DIRECTORY'])
        assert c['Config']['Cmd']==['node','server.js']
    assert {m['Destination'] for m in c['Mounts']}==expected
    assert all(not m['RW'] for m in c['Mounts'])
    assert c['State']['Running']
    print('IDENTITY_BOUNDARY_CONTAINER_VERIFIED')
except Exception:
    print('IDENTITY_BOUNDARY_CONTAINER_INVALID'); raise SystemExit(1)
PY
