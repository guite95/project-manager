import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, symlink, rm, lstat, statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statfsSync } from 'node:fs';

async function implementation() {
  const module = await import('./vault-runtime.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof module.readRuntimeManifest, 'function');
  return module;
}
const manifest = { service: 'project-management', gid: 987, files: [
  { name: 'DATABASE_URL', secretId: 'ocid1.vaultsecret.oc1.ap-chuncheon-1.fixtureA', versionNumber: 1 },
  { name: 'SESSION_SECRET', secretId: 'ocid1.vaultsecret.oc1.ap-chuncheon-1.fixtureB', versionNumber: 1 },
] };

test('manifest rejects insecure files, malformed JSON and expanded scope without leaking input', async t => {
  const { readRuntimeManifest } = await implementation();
  const dir = await mkdtemp(join(tmpdir(), 'pm-manifest-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'manifest.json');
  await writeFile(path, JSON.stringify(manifest), { mode: 0o600 });
  assert.deepEqual(await readRuntimeManifest(path, process.getuid()), manifest);
  await chmod(path, 0o644);
  await assert.rejects(readRuntimeManifest(path, process.getuid()), /VAULT_RUNTIME_CONFIGURATION/);
  await chmod(path, 0o600);
  for (const value of ['{fixture-do-not-print', JSON.stringify({ ...manifest, service: '../flight' }), JSON.stringify({ ...manifest, extra: 'fixture-do-not-print' })]) {
    await writeFile(path, value);
    await assert.rejects(readRuntimeManifest(path, process.getuid()), error => error.message === 'VAULT_RUNTIME_CONFIGURATION');
  }
  await writeFile(path, JSON.stringify(manifest));
  await symlink(path, join(dir, 'link'));
  await assert.rejects(readRuntimeManifest(join(dir, 'link'), process.getuid()), /VAULT_RUNTIME_CONFIGURATION/);
});

test('production preparation refuses a persistent filesystem before creating secret directories', async t => {
  const { prepareRuntimeDirectory } = await implementation();
  const dir = await mkdtemp(join(tmpdir(), 'pm-disk-rejection-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(prepareRuntimeDirectory({ rootDirectory: join(dir, 'runtime'), manifest }), /VAULT_RUNTIME_CONFIGURATION/);
});

test('Linux host publishes synthetic bundles on real tmpfs and the app reads the complete set', {
  skip: process.platform !== 'linux' || process.getuid() !== 0 || statfsSync('/run').type !== 0x01021994,
}, async t => {
  const { prepareRuntimeDirectory } = await implementation();
  const { syncSecrets } = await import('./vault-secrets.mjs');
  const { createSecretReader } = await import('../../lib/server/runtime-secrets.mjs');
  const temp = await mkdtemp('/run/pm-vault-fixture-');
  t.after(() => rm(temp, { recursive: true, force: true }));
  const rootDirectory = join(temp, 'runtime');
  await prepareRuntimeDirectory({ rootDirectory, manifest });
  assert.equal((await statfs(rootDirectory)).type, 0x01021994);
  assert.equal((await lstat(rootDirectory)).mode & 0o777, 0o711);
  await syncSecrets({ rootDirectory, manifest, client: { async getSecretBundle({ secretId, versionNumber }) {
    return { secretBundle: { secretId, versionNumber, stages: ['CURRENT'], secretBundleContent: { contentType: 'BASE64', content: Buffer.from(secretId.endsWith('A') ? 'fixture-db' : 'fixture-session').toString('base64') } } };
  } } });
  const read = createSecretReader({ directory: join(rootDirectory, 'project-management') });
  assert.equal(read('DATABASE_URL'), 'fixture-db');
  assert.equal(read('SESSION_SECRET'), 'fixture-session');
});
