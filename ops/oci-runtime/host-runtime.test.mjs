import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, chmod, rm } from 'node:fs/promises';
import { startObjectBroker, createOciObjectStore } from './host-runtime.mjs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

test('OCI PUT reaches the installed SDK transport as a stream with exact bytes and conditional headers', async t => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const bytes = Buffer.from([0, 255, 128, 1, 2, 3]);
  const md5 = createHash('md5').update(bytes).digest('base64');
  let stream;
  globalThis.fetch = async (_url, options) => {
    stream = options.body;
    assert.ok(stream instanceof Readable, 'raw Buffer triggers OCI SDK Object.keys per byte');
    assert.equal(options.headers.get('content-length'), '6');
    assert.equal(options.headers.get('content-md5'), md5);
    assert.equal(options.headers.get('if-none-match'), '*');
    const received = [];
    for await (const chunk of stream) received.push(chunk);
    assert.deepEqual(Buffer.concat(received), bytes);
    return new Response(null, { status: 200 });
  };
  const store = await createOciObjectStore({ authenticationDetailsProvider: null, region: 'ap-chuncheon-1' });
  await store.putObject({ namespaceName: 'ns', bucketName: 'bucket', objectName: 'recordings/p/test/hash',
    putObjectBody: bytes, contentLength: bytes.length, contentMD5: md5, ifNoneMatch: '*' });
  assert.ok(stream.destroyed);
});

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

test('failed OCI PUT closes its body without retrying or retaining the upload', async t => {
  const previous = globalThis.fetch;
  const previousWarn = console.warn;
  t.after(() => { globalThis.fetch = previous; console.warn = previousWarn; });
  console.warn = () => {};
  let body, calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++; body = options.body;
    throw new Error('synthetic-network-error');
  };
  const store = await createOciObjectStore({ authenticationDetailsProvider: null, region: 'ap-chuncheon-1' });
  await assert.rejects(store.putObject({ namespaceName: 'ns', bucketName: 'bucket', objectName: 'recordings/p/test/hash',
    putObjectBody: Buffer.alloc(6), contentLength: 6, ifNoneMatch: '*' }));
  assert.equal(calls, 1);
  assert.ok(body instanceof Readable);
  assert.ok(body.destroyed);
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
