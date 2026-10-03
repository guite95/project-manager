"""Run the job collector with the deployed app image and existing private DB identity."""
import grp
import json
import os
import re
import subprocess
import sys

NAME = 'project-management-jobs'
ROLE = 'dev-uk.project-management.role'
SECRETS = '/run/oci-service-secrets/project-management'
CONFIG = '/etc/project-management/jobs-worker.json'
HOST_CONFIG = '/opt/project-management-jobs/current/jobs-worker.json'
COMMAND = ['node', 'scripts/jobs-worker.mjs', 'watch', '--config', CONFIG, '--apply']


def run(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError('JOBS_RUNTIME_COMMAND_FAILED')
    return result.stdout


def inspect(name, optional=False):
    result = subprocess.run(['docker', 'inspect', name], capture_output=True, text=True, timeout=15)
    if result.returncode:
        if optional and ('no such object' in result.stderr.lower() or 'no such container' in result.stderr.lower()):
            return None
        raise RuntimeError('JOBS_RUNTIME_INSPECT_FAILED')
    return json.loads(result.stdout)[0]


def container_args(app, gid):
    image = app.get('Image', '')
    tag = app.get('Config', {}).get('Image', '')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image) or not re.fullmatch(r'project-management:[a-f0-9]{40}', tag):
        raise RuntimeError('IMMUTABLE_PM_IMAGE_REQUIRED')
    if not app.get('State', {}).get('Running'):
        raise RuntimeError('APP_NOT_RUNNING')
    mounts = [item for item in app.get('Mounts', []) if item.get('Destination') == SECRETS]
    if len(mounts) != 1 or mounts[0].get('Source') != SECRETS or mounts[0].get('RW') is not False:
        raise RuntimeError('RUNTIME_SECRET_MOUNT_REQUIRED')
    networks = list(app.get('NetworkSettings', {}).get('Networks', {}))
    if len(networks) != 1 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', networks[0]) or networks[0] in ['host', 'none', 'bridge']:
        raise RuntimeError('PRIVATE_APP_NETWORK_REQUIRED')
    if not isinstance(gid, int) or gid < 1:
        raise RuntimeError('RUNTIME_GROUP_REQUIRED')
    return ['docker', 'create', '--name', NAME, '--label', ROLE + '=job-collector',
            '--restart', 'no', '--init', '--user', '1000:1000', '--group-add', str(gid),
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--pids-limit', '64', '--cpus', '1', '--memory', '512m', '--ulimit', 'core=0:0',
            '--network', networks[0], '--mount', f'type=bind,src={SECRETS},dst={SECRETS},readonly',
            '--mount', f'type=bind,src={os.path.realpath(HOST_CONFIG)},dst={CONFIG},readonly',
            '--env', 'NODE_ENV=production', '--env', 'TZ=Asia/Seoul', '--env', f'PM_SECRET_DIRECTORY={SECRETS}',
            image, *COMMAND]


def verify_worker(worker, app, gid):
    config, host = worker['Config'], worker['HostConfig']
    env = dict(item.split('=', 1) for item in config.get('Env', []) if '=' in item)
    mounts = worker.get('Mounts', [])
    checks = [worker['Image'] == app['Image'], config.get('Labels', {}).get(ROLE) == 'job-collector',
              config.get('Cmd') == COMMAND, config.get('User') == '1000:1000',
              host.get('RestartPolicy', {}).get('Name') == 'no', not host.get('PortBindings'),
              host.get('ReadonlyRootfs') is True, host.get('Init') is True,
              host.get('GroupAdd') == [str(gid)], 'ALL' in host.get('CapDrop', []),
              'no-new-privileges:true' in host.get('SecurityOpt', []),
              len(mounts) == 2 and all(mount.get('RW') is False for mount in mounts),
              any(mount.get('Source') == mount.get('Destination') == SECRETS for mount in mounts),
              any(mount.get('Source') == os.path.realpath(HOST_CONFIG) and mount.get('Destination') == CONFIG for mount in mounts),
              env.get('PM_SECRET_DIRECTORY') == SECRETS,
              not any(key in env for key in ['DATABASE_URL', 'SESSION_SECRET', 'APP_PASSWORD_HASH', 'PM_MIGRATION_SECRET_DIRECTORY', 'GOOGLE_APPLICATION_CREDENTIALS']),
              set(worker.get('NetworkSettings', {}).get('Networks', {})) == set(app['NetworkSettings']['Networks']),
              any(limit == {'Name': 'core', 'Soft': 0, 'Hard': 0} for limit in host.get('Ulimits', []))]
    if not all(checks):
        raise RuntimeError('JOBS_CONTAINER_BOUNDARY_INVALID')


def prepare():
    if os.getuid() != 0:
        raise RuntimeError('ROOT_REQUIRED')
    app = inspect('project-management')
    gid = grp.getgrnam('pm-runtime').gr_gid
    args = container_args(app, gid)
    run(['docker', 'exec', 'project-management', 'test', '-r', '/app/scripts/jobs-worker.mjs'])
    run(['docker', 'exec', 'project-management', 'test', '-r', '/app/config/jobs-worker.example.json'])
    current = inspect(NAME, optional=True)
    if current:
        if current.get('Config', {}).get('Labels', {}).get(ROLE) != 'job-collector':
            raise RuntimeError('UNMANAGED_JOBS_CONTAINER')
        if current.get('State', {}).get('Running'):
            verify_worker(current, app, gid)
            return
        # 재배포 뒤 시작할 때 현재 웹 앱과 같은 immutable image를 선택한다.
        run(['docker', 'rm', NAME])
    run(args)
    verify_worker(inspect(NAME), app, gid)


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['prepare']:
            prepare()
        elif sys.argv[1:] == ['verify']:
            verify_worker(inspect(NAME), inspect('project-management'), grp.getgrnam('pm-runtime').gr_gid)
        else:
            raise RuntimeError('INVALID_JOBS_RUNTIME_COMMAND')
        print('JOBS_RUNTIME_VERIFIED')
    except Exception:
        # Docker inspect 내용이나 upstream 오류에는 Secret이 포함될 수 있다.
        print('JOBS_RUNTIME_FAILED', file=sys.stderr)
        raise SystemExit(1)
