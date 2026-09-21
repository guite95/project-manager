import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, chmod, rm } from 'node:fs/promises';
import { startObjectBroker, createOciObjectStore } from './host-runtime.mjs';

test('host binds a protected Unix socket and removes it on owned shutdown', async t => {
  const dir = await mkdtemp('/tmp/pm-host-runtime-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const socketPath = `${dir}/storage.sock`;
  const runtime = await startObjectBroker({ socketPath, config: { namespace: 'ns', bucket: 'bucket' }, store: {} });
  t.after(() => runtime.close());
  assert.equal(runtime.server.address(), socketPath);
  assert.ok((await stat(socketPath)).isSocket());
  assert.equal((await stat(socketPath)).mode & 0o777, 0o660);
  await runtime.close();
  await assert.rejects(stat(socketPath), { code: 'ENOENT' });
  await writeFile(socketPath, 'do not remove');
  await assert.rejects(startObjectBroker({ socketPath, config: { namespace: 'ns', bucket: 'bucket' }, store: {} }));
  assert.equal(await readFile(socketPath, 'utf8'), 'do not remove');
  await rm(socketPath); await chmod(dir, 0o770);
  await assert.rejects(startObjectBroker({ socketPath, config: { namespace: 'ns', bucket: 'bucket' }, store: {} }));
  await assert.rejects(startObjectBroker({ socketPath: 'relative.sock', config: {}, store: {} }));
});

test('installed OCI SDK transport receives per-operation abort, no redirects and no retry', async t => {
  const previous = globalThis.fetch;
  const warnings = [];
  const previousWarn = console.warn;
  console.warn = (...values) => warnings.push(values.join(' '));
  let calls = 0;
  const controller = new AbortController();
  const store = await createOciObjectStore({ authenticationDetailsProvider: null, region: 'ap-chuncheon-1' });
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(String(url), /^https:\/\/objectstorage\.ap-chuncheon-1\.oraclecloud\.com\/n\/ns\/b\/bucket\/o\/materials/);
    assert.equal(options.signal, controller.signal);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ code: 'InternalServerError', message: 'fixture-upstream-failure' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = previous; console.warn = previousWarn; });
  await assert.rejects(store.getObject({ namespaceName: 'ns', bucketName: 'bucket', objectName: 'materials/p/s/hash', abortSignal: controller.signal }));
  assert.equal(calls, 1);
  assert.ok(!warnings.join('\n').includes('fixture-upstream-failure'), 'SDK internal logs must not receive upstream error bodies');
});
