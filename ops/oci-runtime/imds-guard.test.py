import importlib.util
import pathlib
import subprocess
import unittest

spec = importlib.util.spec_from_file_location('imds_guard', pathlib.Path(__file__).with_name('imds-guard.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GuardTest(unittest.TestCase):
    def test_adds_only_metadata_ingress_rule_and_is_idempotent(self):
        calls = []
        present = set()
        def run(args, **kwargs):
            calls.append(args)
            if '-C' in args:
                return subprocess.CompletedProcess(args, 0 if args[0] in present else 1)
            if '-I' in args:
                present.add(args[0])
                return subprocess.CompletedProcess(args, 0)
            self.fail('unexpected firewall mutation')
        guard.ensure_guard(run=run)
        guard.ensure_guard(run=run)
        self.assertEqual([call for call in calls if '-I' in call], [[
            '/usr/sbin/iptables', '-w', '5', '-t', 'raw', '-I', 'PREROUTING', '1',
            '-d', '169.254.169.254/32', '-p', 'tcp', '--dport', '80',
            '-m', 'comment', '--comment', 'pm-container-imds-boundary', '-j', 'DROP',
        ], [
            '/usr/sbin/ip6tables', '-w', '5', '-t', 'raw', '-I', 'PREROUTING', '1',
            '-d', 'fd00:c1::a9fe:a9fe/128', '-p', 'tcp', '--dport', '80',
            '-m', 'comment', '--comment', 'pm-container-imds-boundary', '-j', 'DROP',
        ]])
        self.assertTrue(guard.ensure_guard(check_only=True, run=run))

    def test_check_never_writes_and_fails_for_missing_rule(self):
        def run(args, **kwargs):
            self.assertIn('-C', args)
            return subprocess.CompletedProcess(args, 1)
        with self.assertRaisesRegex(RuntimeError, 'IMDS_GUARD_MISSING'):
            guard.ensure_guard(check_only=True, run=run)

    def test_command_error_does_not_attempt_to_replace_or_flush_rules(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args, 2, stderr=b'sensitive fixture')
        with self.assertRaisesRegex(RuntimeError, '^IMDS_GUARD_FAILED$'):
            guard.ensure_guard(run=run)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__': unittest.main()
