import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { createObjectBrokerServer } from './object-broker.mjs';

const body = Buffer.from('sample');
const ref = { scope: 'materials', project: 'p', slug: 's', sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length };
const route = value => `/v1/objects/${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
async function fixture(t, store, options = {}) {
  const dir = await mkdtemp('/tmp/pm-broker-'); const socketPath = `${dir}/s.sock`;
  const server = createObjectBrokerServer({ config: { namespace: 'ns', bucket: 'bucket' }, store, ...options });
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  server.listen(socketPath); await once(server, 'listening');
  const request = (method, path = route(ref), bytes, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path, method, agent: false, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end(bytes);
  });
  return { socketPath, server, request };
}

test('host independently rejects arbitrary paths, scope, extra fields, traversal and invalid sizes before calling OCI', async t => {
  let calls = 0;
  const { request } = await fixture(t, { getObject: async () => { calls++; throw new Error('secret'); } });
  const variants = [{ ...ref, scope: 'vault' }, { ...ref, bucket: 'other' }, { ...ref, bytes: 0 }, { ...ref, bytes: 16 * 1024 * 1024 + 1 },
    { ...ref, sha256: 'A'.repeat(64) }, ...['..', '.', '', '../x', 'a/b', 'a\\b', '%2f', '%252e', 'a\0b', 'x'.repeat(257)].map(project => ({ ...ref, project }))];
  for (const input of variants) assert.equal((await request('GET', route(input))).status, 400);
  for (const path of ['/metadata', '/v1/objects/bad', `${route(ref)}?bucket=other`, '/v1/objects/' + 'a'.repeat(9000)]) assert.equal((await request('GET', path)).status, 400);
  assert.equal((await request('POST')).status, 405);
  assert.equal(calls, 0);
});

test('PUT validates length/hash and never forwards corrupt bodies or upstream details', async t => {
  let calls = 0;
  const { request } = await fixture(t, { putObject: async () => { calls++; throw { statusCode: 500, message: 'private-credential' }; } });
  assert.equal((await request('PUT')).status, 400);
  assert.equal((await request('PUT', route(ref), 'no', { 'Content-Length': '2' })).status, 400);
  assert.equal((await request('PUT', route(ref), 'broken', { 'Content-Length': '6' })).status, 400);
  assert.equal(calls, 0);
  const result = await request('PUT', route(ref), body, { 'Content-Length': '6', 'Content-Type': 'text/plain' });
  assert.equal(calls, 1); assert.equal(result.status, 502); assert.ok(!result.body.includes('private-credential'));
});

test('GET verifies full upstream bytes and hash before sending success', async t => {
  let response;
  const { request } = await fixture(t, { getObject: async () => response });
  for (const [value, contentLength] of [[Buffer.from('short'), 6], [Buffer.from('broken'), 6], [body, 7], [Buffer.alloc(7), 6]]) {
    response = { value: Readable.from([value]), contentLength };
    assert.equal((await request('GET')).status, 502);
  }
  response = { value: Readable.from([body]), contentLength: 6 };
  assert.deepEqual(await request('GET'), { status: 200, body: 'sample' });
});

test('timed out OCI work holds its concurrency slot until settled', async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const { request } = await fixture(t, { deleteObject: async () => { entered(); await pending; } }, { maxConcurrent: 1, timeoutMs: 50 });
  const first = request('DELETE'); await started;
  assert.equal((await request('DELETE')).status, 503);
  assert.equal((await first).status, 504);
  assert.equal((await request('DELETE')).status, 503);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await request('DELETE')).status, 204);
});

test('slow request bodies and aborted upstream streams do not accumulate background readers', async t => {
  let calls = 0;
  const upstream = new Readable({ read() {} });
  const { request, socketPath } = await fixture(t, {
    putObject: async () => { calls++; }, getObject: async () => ({ value: upstream, contentLength: 6 }),
  }, { timeoutMs: 50 });
  assert.equal((await request('GET')).status, 504);
  assert.equal(upstream.destroyed, true);
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: route(ref), method: 'PUT', headers: { 'Content-Length': '6' }, agent: false }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('s');
  });
  assert.equal(result, 504); assert.equal(calls, 0);
});
