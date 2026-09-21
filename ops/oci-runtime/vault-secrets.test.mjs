import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, chown, chmod, readFile, readlink, readdir, stat, symlink, rm } from 'node:fs/promises';
import { syncSecrets, validateManifest } from './vault-secrets.mjs';

const secret = suffix => `ocid1.vaultsecret.oc1.ap-chuncheon-1.${suffix}`;
async function fixture(t) {
  const rootDirectory = await mkdtemp('/tmp/pm-vault-test-');
  await chown(rootDirectory, process.getuid(), process.getgid());
  const dir = `${rootDirectory}/project-management`;
  await mkdir(dir, { mode: 0o750 });
  const manifest = { service: 'project-management', gid: process.getgid(), files: [
    { name: 'DATABASE_URL', secretId: secret('fixturedb'), versionNumber: 1 },
    { name: 'SESSION_SECRET', secretId: secret('fixturesession'), versionNumber: 2 },
  ] };
  const client = { async getSecretBundle(request) {
    assert.ok(manifest.files.some(f => request.secretId === f.secretId && request.versionNumber === f.versionNumber));
    return { secretBundle: { secretId: request.secretId, versionNumber: request.versionNumber, stages: ['CURRENT'],
      secretBundleContent: { contentType: 'BASE64', content: Buffer.from(`fixture-${request.versionNumber}`).toString('base64') } } };
  } };
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));
  return { rootDirectory, dir, manifest, client };
}
test('publishes complete read-only generations and retains old generation for explicit retirement', async t => {
  const f = await fixture(t);
  assert.deepEqual(await syncSecrets(f), { service: 'project-management', files: 2 });
  const first = await readlink(`${f.dir}/current`);
  assert.equal(await readFile(`${f.dir}/current/DATABASE_URL`, 'utf8'), 'fixture-1');
  assert.equal((await stat(`${f.dir}/current/SESSION_SECRET`)).mode & 0o777, 0o640);
  assert.equal((await stat(`${f.dir}/current`)).mode & 0o777, 0o750);
  await syncSecrets(f);
  assert.notEqual(await readlink(`${f.dir}/current`), first);
  assert.equal(await readFile(`${f.dir}/${first}/DATABASE_URL`, 'utf8'), 'fixture-1');
});
test('provider failure cannot publish a partial generation or expose SDK details', async t => {
  const f = await fixture(t); await syncSecrets(f);
  const before = await readlink(`${f.dir}/current`);
  const names = await readdir(f.dir);
  let n = 0;
  const original = f.client.getSecretBundle;
  f.client.getSecretBundle = async request => { if (++n === 2) throw new Error('SENSITIVE_FIXTURE'); return original(request); };
  await assert.rejects(syncSecrets(f), error => error.message === 'VAULT_SECRET_SYNC_FAILED' && !error.cause && !error.stack.includes('SENSITIVE_FIXTURE'));
  assert.equal(await readlink(`${f.dir}/current`), before);
  assert.deepEqual(await readdir(f.dir), names);
});
test('fixed service and filename allowlists reject arbitrary paths and incomplete manifests before reading Vault', async t => {
  const f = await fixture(t);
  f.client.getSecretBundle = async () => assert.fail('must not contact provider');
  for (const manifest of [
    { ...f.manifest, service: '../flight' },
    { ...f.manifest, files: [f.manifest.files[0]] },
    { ...f.manifest, files: [...f.manifest.files, f.manifest.files[0]] },
    { ...f.manifest, files: [{ ...f.manifest.files[0], name: '../DATABASE_URL' }, f.manifest.files[1]] },
    { ...f.manifest, files: [{ ...f.manifest.files[0], versionNumber: 0 }, f.manifest.files[1]] },
    { ...f.manifest, unexpected: 'SENSITIVE_FIXTURE' },
  ]) await assert.rejects(syncSecrets({ ...f, manifest }), /VAULT_SECRET_SYNC_FAILED/);
});
test('wrong version, wrong secret, retired stage and malformed base64 are rejected', async t => {
  const f = await fixture(t);
  const original = f.client.getSecretBundle;
  for (const mutate of [
    b => { b.versionNumber++; }, b => { b.secretId = secret('different'); },
    b => { b.stages = ['PREVIOUS']; }, b => { b.secretBundleContent.content = '%%%'; },
    b => { b.timeOfExpiry = new Date(Date.now() - 1); },
    b => { b.timeOfDeletion = new Date(Date.now() + 86400000); },
    b => { b.secretBundleContent.content = Buffer.from('x'.repeat(65537)).toString('base64'); },
  ]) {
    f.client.getSecretBundle = async request => { const result = await original(request); mutate(result.secretBundle); return result; };
    await assert.rejects(syncSecrets(f), /VAULT_SECRET_SYNC_FAILED/);
    assert.deepEqual(await readdir(f.dir), []);
  }
});
test('writable service directories and outside current links cannot be used', async t => {
  const f = await fixture(t);
  await chmod(f.dir, 0o770); await assert.rejects(syncSecrets(f), /VAULT_SECRET_SYNC_FAILED/);
  await chmod(f.dir, 0o750); await symlink('/tmp', `${f.dir}/current`);
  await assert.rejects(syncSecrets(f), /VAULT_SECRET_SYNC_FAILED/);
  assert.equal(await readlink(`${f.dir}/current`), '/tmp');
});
test('concurrent sync cannot take another publisher lock or expose partial files', async t => {
  const f = await fixture(t);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const original = f.client.getSecretBundle;
  f.client.getSecretBundle = async request => { entered(); await waiting; return original(request); };
  const first = syncSecrets(f);
  await started;
  await assert.rejects(syncSecrets(f), /VAULT_SECRET_SYNC_FAILED/);
  assert.deepEqual(await readdir(f.dir), ['.sync-lock']);
  release(); await first;
  assert.equal(await readFile(`${f.dir}/current/SESSION_SECRET`, 'utf8'), 'fixture-2');
  assert.ok(!(await readdir(f.dir)).includes('.sync-lock'));
});

test('migration manifest is a separate root-group profile and cannot request session or app files', () => {
  const manifest = { service: 'project-management-migration', gid: 0, files: [{ name: 'DATABASE_URL', secretId: secret('migrationfixture'), versionNumber: 1 }] };
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.throws(() => validateManifest({...manifest, gid: 987}));
  assert.throws(() => validateManifest({...manifest, files: [...manifest.files, {name:'SESSION_SECRET',secretId:secret('sessionfixture'),versionNumber:1}]}));
});
