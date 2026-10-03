import importlib.util
import copy
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('jobs_runtime', pathlib.Path(__file__).with_name('jobs-worker-runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def app():
    return {'Image': 'sha256:' + 'a' * 64, 'Config': {'Image': 'project-management:' + 'b' * 40},
            'State': {'Running': True}, 'Mounts': [{'Source': runtime.SECRETS, 'Destination': runtime.SECRETS, 'RW': False}],
            'NetworkSettings': {'Networks': {'private-db': {}}}}


class JobsRuntimeTest(unittest.TestCase):
    def test_container_readback_rejects_exposed_ports_secrets_and_extra_mounts(self):
        value = {'Image': app()['Image'], 'Config': {'Labels': {runtime.ROLE: 'job-collector'},
                 'Cmd': runtime.COMMAND, 'User': '1000:1000', 'Env': ['PM_SECRET_DIRECTORY=' + runtime.SECRETS]},
                 'HostConfig': {'RestartPolicy': {'Name': 'no'}, 'PortBindings': {}, 'ReadonlyRootfs': True,
                 'Init': True, 'GroupAdd': ['23456'], 'CapDrop': ['ALL'], 'SecurityOpt': ['no-new-privileges:true'],
                 'Ulimits': [{'Name': 'core', 'Soft': 0, 'Hard': 0}]},
                 'Mounts': [{'Source': runtime.SECRETS, 'Destination': runtime.SECRETS, 'RW': False},
                            {'Source': runtime.os.path.realpath(runtime.HOST_CONFIG), 'Destination': runtime.CONFIG, 'RW': False}],
                 'NetworkSettings': app()['NetworkSettings']}
        runtime.verify_worker(value, app(), 23456)
        for mutate in [lambda worker: worker['HostConfig'].update(PortBindings={'3000/tcp': [{}]}),
                       lambda worker: worker['HostConfig'].update(ReadonlyRootfs=False),
                       lambda worker: worker['Config']['Env'].append('DATABASE_URL=forbidden'),
                       lambda worker: worker['Mounts'].append({'Source': '/var/run/docker.sock', 'RW': False}),
                       lambda worker: worker.update(Image='sha256:' + 'c' * 64)]:
            worker = copy.deepcopy(value)
            mutate(worker)
            with self.assertRaisesRegex(RuntimeError, 'BOUNDARY_INVALID'): runtime.verify_worker(worker, app(), 23456)

    def test_missing_container_is_optional_for_both_docker_error_formats(self):
        for message in ['Error: No such object: project-management-jobs', 'error: no such object: project-management-jobs']:
            with patch.object(runtime.subprocess, 'run') as run:
                run.return_value.returncode = 1
                run.return_value.stderr = message
                self.assertIsNone(runtime.inspect(runtime.NAME, optional=True))
        with patch.object(runtime.subprocess, 'run') as run:
            run.return_value.returncode = 1
            run.return_value.stderr = 'permission denied'
            with self.assertRaises(RuntimeError): runtime.inspect(runtime.NAME, optional=True)

    def test_uses_deployed_digest_and_existing_private_secret_mount(self):
        args = runtime.container_args(app(), 23456)
        self.assertIn('sha256:' + 'a' * 64, args)
        self.assertNotIn('project-management:local', args)
        self.assertNotIn('--publish', args)
        self.assertIn('1000:1000', args)
        self.assertIn('PM_SECRET_DIRECTORY=' + runtime.SECRETS, args)
        self.assertTrue(args[-len(runtime.COMMAND):] == runtime.COMMAND)
        self.assertEqual(args.count('--mount'), 2)
        self.assertFalse(any('DATABASE_URL=' in item or 'SESSION_SECRET=' in item for item in args))

    def test_rejects_mutable_image_host_network_and_writable_secret(self):
        for mutate in [lambda value: value['Config'].update(Image='project-management:local'),
                       lambda value: value.update(Image='untrusted:latest'),
                       lambda value: value['State'].update(Running=False),
                       lambda value: value['Mounts'][0].update(RW=True),
                       lambda value: value['NetworkSettings'].update(Networks={'host': {}})]:
            value = app()
            mutate(value)
            with self.assertRaises(RuntimeError): runtime.container_args(value, 23456)

    def test_never_removes_unmanaged_container(self):
        existing = {'Config': {'Labels': {}}, 'State': {'Running': False}}
        calls = []
        with patch.object(runtime.os, 'getuid', return_value=0), patch.object(runtime.grp, 'getgrnam') as group, \
                patch.object(runtime, 'inspect', side_effect=[app(), existing]), patch.object(runtime, 'run', side_effect=lambda args: calls.append(args)):
            group.return_value.gr_gid = 23456
            with self.assertRaisesRegex(RuntimeError, 'UNMANAGED'): runtime.prepare()
        self.assertFalse(any('rm' in args for args in calls))

    def test_redeployment_replaces_only_stopped_owned_worker(self):
        existing = {'Config': {'Labels': {runtime.ROLE: 'job-collector'}}, 'State': {'Running': False}}
        calls = []
        with patch.object(runtime.os, 'getuid', return_value=0), patch.object(runtime.grp, 'getgrnam') as group, \
                patch.object(runtime, 'inspect', side_effect=[app(), existing, {}]), patch.object(runtime, 'run', side_effect=lambda args: calls.append(args)), \
                patch.object(runtime, 'verify_worker'):
            group.return_value.gr_gid = 23456
            runtime.prepare()
        self.assertIn(['docker', 'rm', runtime.NAME], calls)
        self.assertTrue(any(args[:2] == ['docker', 'create'] and 'sha256:' + 'a' * 64 in args for args in calls))


if __name__ == '__main__': unittest.main()
