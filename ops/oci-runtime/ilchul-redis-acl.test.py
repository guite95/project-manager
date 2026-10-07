"""Exercise the recommendation guard's Lua contract against an isolated Redis."""
import hashlib
import importlib.util
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest

spec = importlib.util.spec_from_file_location('ilchul_acl', Path(__file__).with_name('ilchul-redis-acl.py'))
acl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acl)

# Same commands and key layout as Ilchul RecommendationGuard; no production data.
ACQUIRE = """
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= 12 then return 0 end
redis.call('SET', KEYS[2], ARGV[1], 'EX', 120)
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
return 1
"""
RELEASE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
"""


class UnixRedis(acl.shared.Redis):
    def __init__(self, path):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(3)
        self.sock.connect(str(path))
        self.file = self.sock.makefile('rb')


class RecommendationPermissions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        executable = shutil.which('redis-server')
        if executable is None:
            raise RuntimeError('redis-server is required for the isolated ACL integration test')
        cls.temp = tempfile.TemporaryDirectory(prefix='ilchul-acl-', dir='/tmp')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.path = Path(cls.temp.name) / 'redis.sock'
        cls.server = subprocess.Popen([
            executable, '--port', '0', '--unixsocket', str(cls.path),
            '--unixsocketperm', '700', '--save', '', '--appendonly', 'no',
            '--dir', cls.temp.name,
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.addClassCleanup(cls.stop_server)
        for _ in range(100):
            if cls.path.exists():
                return
            if cls.server.poll() is not None:
                raise RuntimeError('isolated Redis failed to start')
            time.sleep(0.02)
        raise RuntimeError('isolated Redis startup timed out')

    @classmethod
    def stop_server(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)

    def setUp(self):
        self.admin = UnixRedis(self.path)
        self.addCleanup(self.admin.close)
        self.admin.command('FLUSHDB')  # Only our disposable, socket-only Redis.
        self.admin.command('ACL', 'SETUSER', 'fixture-ilchul', 'reset', 'on',
                           '>fixture-password', '-@all', *acl.KEYS, *acl.COMMANDS)
        self.app = UnixRedis(self.path)
        self.addCleanup(self.app.close)
        self.app.command('AUTH', 'fixture-ilchul', 'fixture-password')
        self.quota = 'recommendation:{fixture}:quota'
        self.active = 'recommendation:{fixture}:active'

    def test_acquire_blocks_duplicates_and_release_checks_ownership(self):
        self.assertEqual(self.app.command('EVAL', ACQUIRE, 2, self.quota, self.active, 'owner'), 1)
        self.assertEqual(self.app.command('EVAL', ACQUIRE, 2, self.quota, self.active, 'second'), 0)
        self.assertEqual(self.app.command('GET', self.quota), '1')
        self.assertTrue(0 < self.app.command('TTL', self.quota) <= 3600)
        self.assertTrue(0 < self.app.command('TTL', self.active) <= 120)
        self.assertEqual(self.app.command('EVAL', RELEASE, 1, self.active, 'second'), 0)
        self.assertEqual(self.app.command('EVAL', RELEASE, 1, self.active, 'owner'), 1)
        self.assertEqual(self.app.command('EVAL', RELEASE, 1, self.active, 'owner'), 0)

    def test_cached_script_enforces_hourly_quota(self):
        digest = self.admin.command('SCRIPT', 'LOAD', ACQUIRE)
        self.assertEqual(digest, hashlib.sha1(ACQUIRE.encode()).hexdigest())
        for _ in range(12):
            self.assertEqual(self.app.command('EVALSHA', digest, 2, self.quota, self.active, 'owner'), 1)
            self.assertEqual(self.app.command('EVAL', RELEASE, 1, self.active, 'owner'), 1)
        self.assertEqual(self.app.command('EVALSHA', digest, 2, self.quota, self.active, 'owner'), 0)
        self.assertEqual(self.app.command('GET', self.quota), '12')
        self.assertEqual(self.app.command('EXISTS', self.active), 0)

    def test_scripts_cannot_read_other_services_or_run_admin_commands(self):
        self.admin.command('SET', 'youtube-sync:denied', 'fixture-private-value')
        denied = [
            ('GET', 'youtube-sync:denied'),
            ('EVAL', "return redis.call('GET', KEYS[1])", 1, 'youtube-sync:denied'),
            ('EVAL', "return redis.call('GET', 'youtube-sync:denied')", 0),
            ('EVAL', "return redis.call('FLUSHALL')", 0),
            ('ACL', 'LIST'), ('CONFIG', 'GET', '*'), ('FLUSHALL',), ('KEYS', '*'),
        ]
        for command in denied:
            with self.subTest(command=command[0]):
                with self.assertRaisesRegex(RuntimeError, 'REDIS_OPERATION_REJECTED'):
                    self.app.command(*command)
        self.assertEqual(self.admin.command('GET', 'youtube-sync:denied'), 'fixture-private-value')

    def test_existing_draft_and_refresh_access_is_preserved(self):
        self.assertEqual(self.app.command('SET', 'plan:draft:fixture', 'draft'), 'OK')
        self.assertEqual(self.app.command('GET', 'plan:draft:fixture'), 'draft')
        self.assertEqual(self.app.command('HSET', 'refresh:fixture', 'field', 'value'), 1)
        self.assertEqual(self.app.command('HGET', 'refresh:fixture', 'field'), 'value')


if __name__ == '__main__':
    unittest.main()
