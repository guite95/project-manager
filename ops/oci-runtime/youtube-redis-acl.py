"""Restore only the two YouTube ACL users from tmpfs; never change the shared default user."""
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import socket
import stat
import subprocess
import sys


def secret(service):
    if service not in ['youtube-backend', 'youtube-media', 'youtube-migration', 'ilchul-backend', 'ilchul-migration', 'redis-admin']:
        raise RuntimeError()
    root = Path('/run/oci-service-secrets') / service
    parent = root.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or stat.S_IMODE(parent.st_mode) != 0o750:
        raise RuntimeError()
    if service in ['redis-admin', 'ilchul-migration', 'youtube-migration'] and parent.st_gid != 0:
        raise RuntimeError()
    link = root / 'current'
    if not link.is_symlink() or link.lstat().st_uid != 0:
        raise RuntimeError()
    target = os.readlink(link)
    if not re.fullmatch('g-[A-Za-z0-9]{6}', target):
        raise RuntimeError()
    directory = root / target
    ds = directory.lstat()
    if not stat.S_ISDIR(ds.st_mode) or ds.st_uid != 0 or ds.st_gid != parent.st_gid or stat.S_IMODE(ds.st_mode) != 0o750:
        raise RuntimeError()
    fd = os.open(directory / 'CONFIG_JSON', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        fs = os.fstat(source.fileno())
        if not stat.S_ISREG(fs.st_mode) or fs.st_uid != 0 or fs.st_gid != parent.st_gid or stat.S_IMODE(fs.st_mode) != 0o640 or fs.st_nlink != 1:
            raise RuntimeError()
        raw = source.read(65537)
        if not raw or len(raw) > 65536 or len(raw) != fs.st_size or b'\0' in raw:
            raise RuntimeError()
    return json.loads(raw)


class Redis:
    def __init__(self, host):
        self.sock = socket.create_connection((host, 6379), timeout=5)
        self.file = self.sock.makefile('rb')

    def close(self):
        self.file.close()
        self.sock.close()

    def read(self):
        line = self.file.readline(65537)
        if not line.endswith(b'\r\n'):
            raise RuntimeError()
        prefix, data = line[:1], line[1:-2]
        if prefix == b'+': return data.decode()
        if prefix == b'-': raise RuntimeError('REDIS_OPERATION_REJECTED')
        if prefix == b':': return int(data)
        if prefix == b'$':
            size = int(data)
            if size == -1: return None
            if size < 0 or size > 65536: raise RuntimeError()
            result = self.file.read(size + 2)
            if len(result) != size + 2 or not result.endswith(b'\r\n'): raise RuntimeError()
            return result[:-2].decode()
        if prefix == b'*':
            size = int(data)
            if size == -1: return None
            if not 0 <= size <= 1000: raise RuntimeError()
            return [self.read() for _ in range(size)]
        raise RuntimeError()

    def command(self, *args):
        encoded = [str(a).encode() for a in args]
        self.sock.sendall(b'*'+str(len(encoded)).encode()+b'\r\n'+b''.join(b'$'+str(len(a)).encode()+b'\r\n'+a+b'\r\n' for a in encoded))
        return self.read()


def authenticate_admin(client, values, check_only=False):
    user, password = values['REDIS_USERNAME'], values['REDIS_PASSWORD']
    if not re.fullmatch('[A-Za-z_][A-Za-z0-9_-]{0,63}', user) or user == 'default' or not password:
        raise RuntimeError()
    try:
        if client.command('AUTH', user, password) == 'OK': return
    except RuntimeError as error:
        if str(error) != 'REDIS_OPERATION_REJECTED': raise
    if check_only: raise RuntimeError()
    # Bootstrap only a missing named user while the legacy default is still open.
    # A changed password/existing principal is never silently overwritten.
    if client.command('ACL', 'GETUSER', user) is not None: raise RuntimeError()
    raw = client.command('ACL', 'GETUSER', 'default')
    default = dict(zip(raw[::2], raw[1::2]))
    if 'nopass' not in default['flags']: raise RuntimeError()
    client.command('ACL', 'SETUSER', user, 'reset', 'on', '>'+password, '-@all',
                   '+ping', '+acl|getuser', '+acl|setuser', '+acl|dryrun', '+acl|list', '+info', '+client|list')
    if client.command('AUTH', user, password) != 'OK': raise RuntimeError()


def admin_client(host, check_only=False):
    client = Redis(host)
    try:
        authenticate_admin(client, secret('redis-admin'), check_only)
        return client
    except Exception:
        client.close()
        raise


def reconcile(check_only=False):
    if os.getuid() != 0: raise RuntimeError()
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    container = json.loads(subprocess.check_output(['docker', 'inspect', 'redis'], timeout=10))[0]
    host = container['NetworkSettings']['Networks']['shared-infra']['IPAddress']
    if not re.fullmatch(r'172\.27\.\d{1,3}\.\d{1,3}', host): raise RuntimeError()
    client = admin_client(host, check_only)
    try:
        # Preserve default unchanged; named host authentication also works after closure.
        default_raw = client.command('ACL', 'GETUSER', 'default')
        default = dict(zip(default_raw[::2], default_raw[1::2]))
        accounts = []
        for service, prefix in [('youtube-backend', 'youtube-sync:room:runtime:v3:'), ('youtube-media', 'youtube-sync:media:resolved:v1:')]:
            values = secret(service)
            user, password = values['REDIS_USERNAME'], values['REDIS_PASSWORD']
            if not re.fullmatch('[A-Za-z_][A-Za-z0-9_-]{0,63}', user) or user == 'default' or not password:
                raise RuntimeError()
            accounts.append(user)
            expected = hashlib.sha256(password.encode()).hexdigest()
            commands = ['+get', '+set', '+del', '+ping', '+hello', '+select', '+client|setinfo', '+client|setname']
            if service == 'youtube-backend': commands.append('+info')
            current = client.command('ACL', 'GETUSER', user)
            if current is None:
                if check_only: raise RuntimeError()
                client.command('ACL', 'SETUSER', user, 'reset', 'on', '>'+password, '~'+prefix+'*', '-@all', *commands)
                current = client.command('ACL', 'GETUSER', user)
            state = dict(zip(current[::2], current[1::2]))
            if state['passwords'] != [expected] or 'on' not in state['flags'] or set(state['flags']) - {'on', 'sanitize-payload'} or state['keys'] != '~'+prefix+'*':
                raise RuntimeError()
            if set(state['commands'].split()) != set(['-@all', *commands]) or state.get('selectors') or state.get('channels'):
                raise RuntimeError()
            for command in [('GET', prefix+'vault-readiness'), ('SET', prefix+'vault-readiness', 'synthetic'), ('DEL', prefix+'vault-readiness')]:
                if client.command('ACL', 'DRYRUN', user, *command) != 'OK': raise RuntimeError()
            for command in [('GET', 'other-service:denied'), ('CONFIG', 'GET', '*'), ('ACL', 'LIST'), ('FLUSHALL',), ('KEYS', '*')]:
                try:
                    allowed = client.command('ACL', 'DRYRUN', user, *command) == 'OK'
                except RuntimeError as error:
                    if str(error) != 'REDIS_OPERATION_REJECTED': raise
                    allowed = False
                if allowed: raise RuntimeError()
            probe = Redis(host)
            try:
                if probe.command('AUTH', user, password) != 'OK' or probe.command('PING') != 'PONG': raise RuntimeError()
            finally: probe.close()
        if len(set(accounts)) != 2: raise RuntimeError()
        return {'ok': True, 'scopedUsers': 2, 'defaultUserUnchanged': True, 'defaultNopassException': 'nopass' in default['flags'], 'namedAdmin': True}
    finally: client.close()


if __name__ == '__main__':
    try:
        if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] != '--check'): raise RuntimeError()
        print(json.dumps(reconcile(len(sys.argv) == 2)))
    except Exception:
        print(json.dumps({'ok': False, 'code': 'YOUTUBE_REDIS_ACL_FAILED'}))
        sys.exit(1)
