import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createObjectBrokerServer } from '../../ops/oci-runtime/object-broker.mjs';
import { createObjectBrokerClient } from './object-storage-broker-client.mjs';

test('Unix broker preserves verified object upload/read/delete and conditional create semantics', async t => {
  const dir = await mkdtemp('/tmp/pm-broker-');
  const socket = `${dir}/storage.sock`;
  const objects = new Map();
  const config = { region: 'ap-seoul-1', namespace: 'ns', bucket: 'fixed-bucket' };
  const store = {
    async putObject(r) {
      assert.equal(r.namespaceName, 'ns'); assert.equal(r.bucketName, 'fixed-bucket');
      assert.equal(r.ifNoneMatch, '*');
      if (objects.has(r.objectName)) throw { statusCode: 412, message: 'upstream-secret' };
      objects.set(r.objectName, Buffer.from(r.putObjectBody));
    },
    async getObject(r) {
      if (!objects.has(r.objectName)) throw { statusCode: 404, message: 'upstream-secret' };
      const b = objects.get(r.objectName);
      return { value: Readable.from([b]), contentLength: b.length };
    },
    async deleteObject(r) {
      if (!objects.delete(r.objectName)) throw { statusCode: 404 };
    },
  };
  const server = createObjectBrokerServer({ config, store });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  server.listen(socket); await once(server, 'listening');
  const c = createObjectBrokerClient(socket);
  for (const scope of ['materials', 'recordings']) {
    const bytes = Buffer.from('verified contents');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const brokerReference = { scope, project: '한글 프로젝트', slug: '자료', sha256, bytes: bytes.length };
    const args = { namespaceName: 'ns', bucketName: 'fixed-bucket', objectName: `${scope}/%ED%95%9C%EA%B8%80%20%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8/%EC%9E%90%EB%A3%8C/${sha256}`, brokerReference };
    await c.putObject({ ...args, putObjectBody: bytes, contentLength: bytes.length, contentType: 'application/pdf', ifNoneMatch: '*' });
    await assert.rejects(c.putObject({ ...args, putObjectBody: bytes, contentLength: bytes.length, contentType: 'application/pdf', ifNoneMatch: '*' }), e => e.statusCode === 412 && !e.stack.includes('upstream-secret'));
    const response = await c.getObject(args);
    assert.equal(response.contentLength, bytes.length);
    const chunks = []; for await (const chunk of response.value) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes);
    assert.ok(objects.has(args.objectName));
    await c.deleteObject(args);
    await assert.rejects(c.getObject(args), e => e.statusCode === 404);
  }
  await assert.rejects(c.getObject({ brokerReference: { scope: 'materials' } }));
  assert.throws(() => createObjectBrokerClient('relative.sock'));

  // Exercise actual object-storage selection/calls with no direct OCI credentials.
  const env = { OCI_STORAGE_REGION: 'ap-seoul-1', OCI_STORAGE_NAMESPACE: 'ns', OCI_STORAGE_BUCKET: 'fixed-bucket', OCI_STORAGE_AUTH: 'broker', OCI_STORAGE_BROKER_SOCKET: socket };
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const storage = await import('./object-storage.mjs?broker-integration');
  const ref = await storage.putObject(Buffer.from('integration'), 'p', 's', 'text/plain');
  assert.equal((await storage.readObject(ref, 'p', 's')).toString(), 'integration');
  await storage.deleteObject(ref, 'p', 's');
  await storage.deleteObject(ref, 'p', 's');
});

test('client rejects redirects, corrupt/truncated replies and never exposes upstream error bodies', async t => {
  const dir = await mkdtemp('/tmp/pm-broker-client-'); const socket = `${dir}/s.sock`;
  let handler;
  const server = http.createServer((req, res) => handler(req, res));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  server.listen(socket); await once(server, 'listening');
  const bytes = Buffer.from('expected'); const hash = createHash('sha256').update(bytes).digest('hex');
  const args = { objectName: `materials/p/s/${hash}`, brokerReference: { scope: 'materials', project: 'p', slug: 's', sha256: hash, bytes: 8 } };
  const c = createObjectBrokerClient(socket);
  const variants = [
    (_req, res) => { res.writeHead(302, { Location: 'http://169.254.169.254/', 'Content-Length': '0' }); res.end(); },
    (_req, res) => { res.writeHead(500); res.end('private-fixture-value'); },
    (_req, res) => { res.writeHead(200, { 'Content-Length': '8' }); res.end('tampered'); },
    (_req, res) => { res.writeHead(200, { 'Content-Length': '8' }); res.end('short'); },
    (_req, res) => { res.writeHead(200, { 'Content-Length': '900000000' }); res.end(); },
  ];
  for (handler of variants) await assert.rejects(c.getObject(args), e => {
    assert.equal(e.message, 'OBJECT_BROKER_REQUEST_FAILED'); assert.equal(e.cause, undefined);
    assert.ok(!e.stack.includes('private-fixture-value')); return true;
  });
  await assert.rejects(c.putObject({ ...args, putObjectBody: bytes, contentLength: 8, ifNoneMatch: '*', contentType: 'private-fixture-value\r\nInjected: true' }), e => e.message === 'OBJECT_BROKER_REQUEST_FAILED');
});
