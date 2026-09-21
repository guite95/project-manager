import importlib.util
import os
import pathlib
import stat
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('prepare_cutover', pathlib.Path(__file__).with_name('prepare-cutover.py'))
cutover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cutover)
Path = pathlib.Path
real_lstat = Path.lstat


class PreparationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pm-cutover-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.release = self.path('/opt/project-management-runtime/releases/' + 'a' * 40)
        (self.release / 'ops/oci-runtime').mkdir(parents=True)
        self.path('/opt/project-management-runtime/current').symlink_to(self.release)
        for name in ['project-management-runtime.service','project-management-imds-guard.service']:
            (self.release / 'ops/oci-runtime' / name).write_text('verified fixture unit')
        self.env = self.path('/home/ubuntu/project-management/.env')
        self.env.parent.mkdir(parents=True)
        self.original = 'DATABASE_URL=synthetic-secret\nCOMPOSE_FILE=old.yml\nSESSION_SECRET=fixture-secret\n'
        self.env.write_text(self.original); self.env.chmod(0o600)
        self.path('/etc/systemd/system').mkdir(parents=True)
        self.path('/etc/systemd/system/project-management-runtime.service').write_text('old fixture unit')
        self.backup = self.path('/var/backups/oci-vault-migration')
        self.backup.mkdir(parents=True); self.backup.chmod(0o700)

    def path(self, value):
        value = str(value)
        return Path(self.root / value.lstrip('/')) if value.startswith(('/opt/','/etc/','/var/','/home/')) else Path(value)

    def prepare(self):
        def root_stat(path):
            value = list(real_lstat(path)); value[4] = 0
            return os.stat_result(value)
        with patch.object(cutover.pathlib,'Path',self.path), patch.object(Path,'lstat',root_stat), \
             patch.object(cutover.os,'getuid',return_value=0), patch.object(cutover.os,'fchown'), \
             patch.object(cutover.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=987)), \
             patch.object(cutover.subprocess,'run',return_value=subprocess.CompletedProcess([],0)):
            cutover.prepare()

    def test_preserves_existing_values_and_original_backup_on_redeploy(self):
        self.prepare(); self.prepare()
        self.assertEqual(self.env.read_text(), 'DATABASE_URL=synthetic-secret\nSESSION_SECRET=fixture-secret\nCOMPOSE_FILE=docker-compose.yml:docker-compose.identity-boundary.yml\nPM_RUNTIME_GID=987\n')
        self.assertEqual((self.backup / 'pm-before-identity.env').read_text(), self.original)
        self.assertEqual((self.backup / 'pm-before-identity.service').read_text(), 'old fixture unit')
        self.assertEqual(stat.S_IMODE(self.env.stat().st_mode), 0o600)
        self.assertEqual(self.path('/etc/project-management-runtime.conf').read_text(), 'PM_RUNTIME_GID=987\n')

    def test_unsafe_input_permissions_fail_before_config_changes(self):
        self.env.chmod(0o644)
        with self.assertRaises(RuntimeError): self.prepare()
        self.assertEqual(self.env.read_text(), self.original)
        self.assertEqual(list(self.backup.iterdir()), [])
        self.assertFalse(self.path('/etc/project-management-runtime.conf').exists())

    def test_vault_mode_survives_redeploy_without_reintroducing_env_credentials(self):
        marker = self.path('/etc/project-management-vault.enabled')
        marker.write_text('enabled\n'); marker.chmod(0o600)
        for name in ['project-management-secrets.service', 'project-management-vault.conf']:
            (self.release / 'ops/oci-runtime' / name).write_text('verified fixture unit')
        self.prepare(); self.prepare()
        self.assertEqual(self.env.read_text(), 'COMPOSE_FILE=docker-compose.yml:docker-compose.identity-boundary.yml:docker-compose.vault.yml\nPM_RUNTIME_GID=987\n')
        self.assertEqual((self.backup / 'pm-before-vault.env').read_text(), self.original)
        self.assertTrue(self.path('/etc/systemd/system/project-management-secrets.service').is_file())
        self.assertTrue(self.path('/etc/systemd/system/project-management-runtime.service.d/vault.conf').is_file())

    def test_invalid_marker_never_falls_back_to_legacy(self):
        marker = self.path('/etc/project-management-vault.enabled')
        marker.write_text('enabled\n'); marker.chmod(0o644)
        with self.assertRaises(RuntimeError): self.prepare()
        self.assertEqual(self.env.read_text(), self.original)


if __name__ == '__main__': unittest.main()
