import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, chmod, symlink, rm, readdir } from 'node:fs/promises';
import { publishGoogleToken } from './token-publisher.mjs';
import { createGoogleRuntimeAuth } from '../../lib/server/google-runtime-auth.mjs';

async function fixture(t) {
  const dir = await mkdtemp('/tmp/pm-token-publisher-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outputPath = `${dir}/access-token.json`;
  const client = { credentials: { expiry_date: Date.now() + 120_000 }, getAccessToken: async () => ({ token: 'fixture-host-token' }) };
  return { dir, outputPath, client, auth: { getClient: async () => client } };
}
test('publisher atomically replaces a complete group-readable token usable by app auth', async t => {
  const f = await fixture(t);
  await publishGoogleToken(f);
  assert.equal((await stat(f.outputPath)).mode & 0o777, 0o640);
  assert.equal((await createGoogleRuntimeAuth({ GOOGLE_ACCESS_TOKEN_FILE: f.outputPath }).getRequestHeaders()).get('authorization'), 'Bearer fixture-host-token');
  f.client.getAccessToken = async () => ({ token: 'fixture-next' });
  const reads = Array.from({ length: 20 }, () => readFile(f.outputPath, 'utf8').then(JSON.parse));
  await publishGoogleToken(f);
  for (const value of await Promise.all(reads)) assert.ok(['fixture-host-token', 'fixture-next'].includes(value.access_token));
  assert.equal(JSON.parse(await readFile(f.outputPath, 'utf8')).access_token, 'fixture-next');
  assert.deepEqual(await readdir(f.dir), ['access-token.json']);
});
test('invalid provider output and errors preserve last token without leaking secrets or partial files', async t => {
  const f = await fixture(t); await publishGoogleToken(f);
  const before = await readFile(f.outputPath, 'utf8');
  const safe = error => { assert.equal(error.message, 'GOOGLE_TOKEN_PUBLICATION_FAILED'); assert.equal(error.cause, undefined); assert.ok(!error.stack.includes('fixture-host-token')); return true; };
  for (const token of ['', 'bad token', 'a'.repeat(17000), { access_token: 'fixture-host-token' }]) {
    f.client.getAccessToken = async () => ({ token });
    await assert.rejects(publishGoogleToken(f), safe);
  }
  f.client.getAccessToken = async () => ({ token: 'fixture-host-token' });
  for (const expiry_date of [undefined, '999999999999', Date.now() - 1, Date.now() + 59_000]) {
    f.client.credentials = { expiry_date };
    await assert.rejects(publishGoogleToken(f), safe);
  }
  f.client.getAccessToken = async () => { throw new Error('fixture-host-token'); };
  await assert.rejects(publishGoogleToken(f), safe);
  assert.equal(await readFile(f.outputPath, 'utf8'), before);
  assert.deepEqual(await readdir(f.dir), ['access-token.json']);
});
test('publisher refuses symlink output and app-writable parent directory', async t => {
  const f = await fixture(t);
  await writeFile(`${f.dir}/target`, 'untouched'); await symlink(`${f.dir}/target`, f.outputPath);
  await assert.rejects(publishGoogleToken(f), /PUBLICATION_FAILED/);
  assert.equal(await readFile(`${f.dir}/target`, 'utf8'), 'untouched');
  await rm(f.outputPath); await chmod(f.dir, 0o770);
  await assert.rejects(publishGoogleToken(f), /PUBLICATION_FAILED/);
});
