import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, chmod, rm, stat } from 'node:fs/promises';
import { checkIdentityReadiness } from './identity-readiness.mjs';

async function fixture(t) {
  const dir = await mkdtemp('/tmp/pm-ready-');
  const brokerDirectory = `${dir}/broker`, tokenDirectory = `${dir}/google`;
  await mkdir(brokerDirectory, { mode: 0o750 }); await mkdir(tokenDirectory, { mode: 0o750 });
  const token = { access_token: 'readiness-fixture', expiry_date: Date.now() + 300_000 };
  await writeFile(`${tokenDirectory}/access-token.json`, JSON.stringify(token), { mode: 0o640 });
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(`${brokerDirectory}/storage.sock`, resolve));
  await chmod(`${brokerDirectory}/storage.sock`, 0o660);
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  // macOS temporary directories inherit the parent group, not necessarily getgid().
  return { brokerDirectory, tokenDirectory, expectedUid: process.getuid(), expectedGid: (await stat(brokerDirectory)).gid };
}
test('readiness requires both a listening protected socket and valid file token', async t => {
  const f = await fixture(t);
  assert.equal(await checkIdentityReadiness(f), true);
  await writeFile(`${f.tokenDirectory}/access-token.json`, '{"access_token":"sensitive-fixture","expiry_date":1}');
  await assert.rejects(checkIdentityReadiness(f), { message: 'IDENTITY_BOUNDARY_NOT_READY' });
});
test('wrong group and group-writable directories cannot pass readiness', async t => {
  const f = await fixture(t);
  await assert.rejects(checkIdentityReadiness({ ...f, expectedGid: f.expectedGid + 1 }), /NOT_READY/);
  await chmod(f.brokerDirectory, 0o770);
  await assert.rejects(checkIdentityReadiness(f), /NOT_READY/);
});
test('missing socket and malformed token fail closed without ADC fallback', async t => {
  const f = await fixture(t);
  await writeFile(`${f.tokenDirectory}/access-token.json`, 'sensitive-fixture');
  const safe = error => error.message === 'IDENTITY_BOUNDARY_NOT_READY' && !error.cause && !error.stack.includes('sensitive-fixture');
  await assert.rejects(checkIdentityReadiness(f), safe);
  await rm(`${f.brokerDirectory}/storage.sock`);
  await assert.rejects(checkIdentityReadiness(f), safe);
});
