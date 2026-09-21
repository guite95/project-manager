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
export PM_RECORDINGS_MODE
PM_RECORDINGS_MODE=$(sudo -n python3 scripts/prepare-identity-cutover.py --recordings)
[[ "$PM_RECORDINGS_MODE" == enabled || "$PM_RECORDINGS_MODE" == disabled ]]
if [[ "$PM_DEPLOYMENT_MODE" == vault ]]; then
  export COMPOSE_FILE="$COMPOSE_FILE:docker-compose.vault.yml"
  # A restart of a Requires= dependency can stop the still-serving app.
  # Reload refreshes the generation without deactivating that dependency.
  sudo -n systemctl start project-management-secrets.service
  sudo -n systemctl reload project-management-secrets.service
  sudo -n /bin/bash -c 'ulimit -c 0; exec "$@"' pm-vault-readiness /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/vault-readiness.mjs
fi
if [[ "$PM_RECORDINGS_MODE" == enabled ]]; then
  [[ "$PM_DEPLOYMENT_MODE" == vault ]]
  export COMPOSE_FILE="$COMPOSE_FILE:docker-compose.recordings.yml"
fi
sudo -n /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/identity-readiness.mjs "$PM_RUNTIME_GID"
python3 - <<'PY'
import os,json,subprocess
try:
    p=subprocess.run(['docker','compose','config','--format','json'],capture_output=True,text=True,check=True)
    services=json.loads(p.stdout)['services']
    app=services['app']; env=app['environment']; mounts=app['volumes']
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
    if os.environ['PM_RECORDINGS_MODE']=='enabled':
        worker=services['recordings']; values=worker['environment']; volumes=worker['volumes']
        assert worker['image']==app['image']==os.environ['APP_IMAGE']
        assert worker.get('restart')=='no' and not worker.get('ports')
        assert worker.get('group_add')==[os.environ['PM_RUNTIME_GID']]
        assert worker.get('command')==['node','--experimental-strip-types','scripts/recordings-worker.mjs']
        assert worker.get('ulimits',{}).get('core') in [{},{'soft':0,'hard':0}]
        assert len(volumes)==len(expected) and {m['target'] for m in volumes}==expected
        assert all(m['source']==m['target'] and m['type']=='bind' and m.get('read_only') is True for m in volumes)
        assert not any(k in values for k in ['DATABASE_URL','SESSION_SECRET','APP_PASSWORD_HASH','PM_MIGRATION_SECRET_DIRECTORY'])
        for key in ['PM_SECRET_DIRECTORY','OCI_STORAGE_AUTH','OCI_STORAGE_BROKER_SOCKET','GOOGLE_ACCESS_TOKEN_FILE','GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CLOUD_PROJECT','GOOGLE_SPEECH_LOCATION','GOOGLE_SPEECH_BUCKET']:
            assert values.get(key)==env.get(key)
        assert env.get('GOOGLE_SPEECH_LOCATION')=='us' and env.get('GOOGLE_SPEECH_BUCKET')
except Exception:
    print('IDENTITY_COMPOSE_INVALID'); raise SystemExit(1)
PY
# This is before stopping/replacing the old app. Failure leaves it running.
if [[ "$PM_DEPLOYMENT_MODE" == vault ]]; then
  sudo -n /bin/bash -c 'ulimit -c 0; exec "$@"' pm-host-migration /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/migrate-pm.mjs "$APP_IMAGE"
fi
# All readiness/config checks precede the interruption of the old container.
sudo -n python3 scripts/prepare-identity-cutover.py
sudo -n systemctl daemon-reload
if [[ "$PM_RECORDINGS_MODE" == enabled ]]; then
  sudo -n systemctl stop project-management-recordings.service
fi
sudo -n systemctl stop project-management-runtime.service
docker stop --time 30 project-management > /dev/null
sudo -n systemctl enable project-management-imds-guard.service project-management-runtime.service
sudo -n systemctl start project-management-imds-guard.service
sudo -n /opt/node24/bin/node /opt/project-management-runtime/current/ops/oci-runtime/identity-readiness.mjs "$PM_RUNTIME_GID"
docker compose up -d --no-build --pull never app
sudo -n systemctl start project-management-runtime.service
sudo -n systemctl is-active --quiet project-management-runtime.service
if [[ "$PM_RECORDINGS_MODE" == enabled ]]; then
  # Create only: systemd checks identity/secrets before starting the worker.
  docker compose create --no-build --pull never recordings
  sudo -n systemctl enable project-management-recordings.service
  sudo -n systemctl start project-management-recordings.service
  sudo -n systemctl is-active --quiet project-management-recordings.service
fi
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
        assert any(limit=={'Name':'core','Soft':0,'Hard':0} for limit in c['HostConfig'].get('Ulimits',[]))
    assert {m['Destination'] for m in c['Mounts']}==expected
    assert all(not m['RW'] for m in c['Mounts'])
    assert c['State']['Running']
    if os.environ['PM_RECORDINGS_MODE']=='enabled':
        worker=json.loads(subprocess.run(['docker','inspect','project-management-recordings'],capture_output=True,text=True,check=True).stdout)[0]
        values=dict(item.split('=',1) for item in worker['Config']['Env'] if '=' in item)
        assert worker['State']['Running'] and worker['Image']==c['Image']
        assert worker['HostConfig']['RestartPolicy']['Name']=='no'
        assert not worker['HostConfig'].get('PortBindings')
        assert {m['Destination'] for m in worker['Mounts']}==expected and all(not m['RW'] for m in worker['Mounts'])
        assert not any(k in values for k in ['DATABASE_URL','SESSION_SECRET','APP_PASSWORD_HASH','PM_MIGRATION_SECRET_DIRECTORY'])
        for key in ['PM_SECRET_DIRECTORY','OCI_STORAGE_AUTH','OCI_STORAGE_BROKER_SOCKET','GOOGLE_ACCESS_TOKEN_FILE','GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CLOUD_PROJECT','GOOGLE_SPEECH_LOCATION','GOOGLE_SPEECH_BUCKET']:
            assert values.get(key)==env.get(key)
        assert any(limit=={'Name':'core','Soft':0,'Hard':0} for limit in worker['HostConfig'].get('Ulimits',[]))
    print('IDENTITY_BOUNDARY_CONTAINER_VERIFIED')
except Exception:
    print('IDENTITY_BOUNDARY_CONTAINER_INVALID'); raise SystemExit(1)
PY
