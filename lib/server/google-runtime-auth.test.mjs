import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rename, chmod, symlink, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { createGoogleRuntimeAuth } from './google-runtime-auth.mjs';

async function fixture(t) {
  const dir = await mkdtemp('/tmp/pm-google-auth-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'token.json');
  const token = (access_token = 'fixture-token', expiry_date = Date.now() + 120_000) => ({ access_token, expiry_date });
  await writeFile(path, JSON.stringify(token()), { mode: 0o640 });
  return { dir, path, token, auth: createGoogleRuntimeAuth({ GOOGLE_ACCESS_TOKEN_FILE: path }) };
}

test('file auth uses the installed auth contract and observes atomic replacement on every request', async t => {
  const { path, token, auth } = await fixture(t);
  assert.ok(auth instanceof OAuth2Client);
  assert.equal((await auth.getRequestHeaders()).get('authorization'), 'Bearer fixture-token');
  await writeFile(`${path}.next`, JSON.stringify(token('fixture-replaced')), { mode: 0o600 });
  await rename(`${path}.next`, path);
  assert.equal((await auth.getRequestHeaders()).get('authorization'), 'Bearer fixture-replaced');
  assert.equal((await auth.getAccessToken()).token, 'fixture-replaced');
  assert.equal(auth.credentials.refresh_token, undefined);
  assert.ok(createGoogleRuntimeAuth({}) instanceof GoogleAuth);
});

test('explicit token file failures never fall back to ADC or disclose file contents', async t => {
  const { path, token, auth } = await fixture(t);
  const cases = [token('', Date.now() + 120_000), token('fixture token'), token('fixture\ntoken'),
    token('fixture-token', Date.now() - 1), token('fixture-token', Date.now() + 10_000),
    token('fixture-token', '9999999999999'), token('fixture-token', Number.MAX_SAFE_INTEGER + 1),
    { access_token: { secret: 'fixture-token' }, expiry_date: Date.now() + 120_000 }];
  const safe = error => {
    assert.equal(error.message, 'GOOGLE_RUNTIME_TOKEN_UNAVAILABLE');
    assert.equal(error.cause, undefined);
    assert.ok(!JSON.stringify(error).includes('fixture'));
    assert.ok(!error.stack.includes('fixture-token'));
    return true;
  };
  for (const input of cases) {
    await writeFile(path, JSON.stringify(input));
    await assert.rejects(auth.getRequestHeaders(), safe);
  }
  for (const text of ['{"access_token":"fixture-token",', 'fixture-token'.repeat(2000)]) {
    await writeFile(path, text);
    await assert.rejects(auth.getRequestHeaders(), safe);
  }
  await writeFile(path, JSON.stringify(token()));
  await chmod(path, 0o660);
  await assert.rejects(auth.getRequestHeaders(), safe);
  await chmod(path, 0o602);
  await assert.rejects(auth.getRequestHeaders(), safe);
  await rm(path);
  await assert.rejects(auth.getRequestHeaders(), safe);
  await mkdir(path);
  await assert.rejects(auth.getRequestHeaders(), safe);
  await rm(path, { recursive: true });
  await writeFile(`${path}.target`, JSON.stringify(token()), { mode: 0o600 });
  await symlink(`${path}.target`, path);
  await assert.rejects(auth.getRequestHeaders(), safe);
  for (const bad of ['', 'relative.json']) {
    await assert.rejects(createGoogleRuntimeAuth({ GOOGLE_ACCESS_TOKEN_FILE: bad }).getRequestHeaders(), safe);
  }
});

test('authenticated transport cannot retry ambiguous submissions or leak SDK errors', async t => {
  const { auth } = await fixture(t);
  let calls = 0;
  auth.transporter.request = async options => {
    calls++;
    assert.equal(options.headers.get('authorization'), 'Bearer fixture-token');
    assert.equal(options.retry, false);
    assert.equal(options.maxRedirects, 0);
    const error = new Error('fixture-token private-body');
    error.config = options;
    error.response = { status: 412, data: 'private-body', config: options };
    throw error;
  };
  await assert.rejects(auth.request({ url: 'https://storage.googleapis.com/', method: 'POST', data: 'private-body', retry: true }), error => {
    assert.equal(error.message, 'GOOGLE_RUNTIME_REQUEST_FAILED');
    assert.deepEqual(error.response, { status: 412 });
    assert.equal(error.config, undefined);
    assert.equal(error.cause, undefined);
    assert.ok(!error.stack.includes('fixture-token'));
    assert.ok(!JSON.stringify(error).includes('private-body'));
    return true;
  });
  assert.equal(calls, 1);
});
