"""Block ingress/forwarded IMDS HTTP, while preserving host OUTPUT access.

The raw PREROUTING rule does not depend on bridge names or Docker filter chains.
It does not block DNS, NTP, or the rest of the link-local network.
"""
import os
import subprocess
import sys


def ensure_guard(check_only=False, run=subprocess.run):
    # OCI SDK also supports IPv6 IMDS. Protect it even before an IPv6 route exists.
    for binary, destination in [('/usr/sbin/iptables', '169.254.169.254/32'),
                                ('/usr/sbin/ip6tables', 'fd00:c1::a9fe:a9fe/128')]:
        base = [binary, '-w', '5', '-t', 'raw']
        match = ['-d', destination, '-p', 'tcp', '--dport', '80',
                 '-m', 'comment', '--comment', 'pm-container-imds-boundary', '-j', 'DROP']
        def call(operation):
            try:
                return run(base + operation + match, capture_output=True, timeout=10).returncode
            except Exception:
                raise RuntimeError('IMDS_GUARD_FAILED') from None
        status = call(['-C', 'PREROUTING'])
        if status == 0: continue
        if status != 1: raise RuntimeError('IMDS_GUARD_FAILED')
        if check_only: raise RuntimeError('IMDS_GUARD_MISSING')
        if call(['-I', 'PREROUTING', '1']) != 0: raise RuntimeError('IMDS_GUARD_FAILED')
        if call(['-C', 'PREROUTING']) != 0: raise RuntimeError('IMDS_GUARD_FAILED')
    return True


if __name__ == '__main__':
    try:
        if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in ('--check', '--apply'):
            raise RuntimeError('IMDS_GUARD_INVOCATION')
        ensure_guard(check_only=sys.argv[1] == '--check')
    except Exception:
        print('IMDS_GUARD_FAILED', file=sys.stderr)
        raise SystemExit(1)
