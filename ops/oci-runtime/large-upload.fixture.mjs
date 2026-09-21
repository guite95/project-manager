// 합성 바이트만 사용한다. 실제 broker/OCI SDK를 통과하되 외부 HTTP 전송만 대체한다.
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createObjectBrokerServer } from './object-broker.mjs';
import { createOciObjectStore } from './host-runtime.mjs';

const size = 100 * 1024 * 1024;
const chunk = Buffer.alloc(64 * 1024, 173);
const hash = createHash('sha256');
for (let i = 0; i < size / chunk.length; i++) hash.update(chunk);
const expected = hash.digest('hex');
let entered = 0, verified = 0, release, allEntered;
const barrier = new Promise(resolve => { release = resolve; });
const ready = new Promise(resolve => { allEntered = resolve; });
let peak = process.memoryUsage().rss;
const sample = () => { peak = Math.max(peak, process.memoryUsage().rss); };
const timer = setInterval(sample, 5);
const previous = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  assert.ok(options.body instanceof Readable);
  assert.equal(options.headers.get('content-length'), String(size));
  assert.equal(options.headers.get('if-none-match'), '*');
  assert.equal(options.redirect, 'error');
  if (++entered === 4) allEntered();
  await barrier;
  let count = 0;
  const digest = createHash('sha256');
  const md5 = createHash('md5');
  for await (const bytes of options.body) { count += bytes.length; digest.update(bytes); md5.update(bytes); sample(); }
  assert.equal(count, size);
  assert.equal(digest.digest('hex'), expected);
  assert.equal(md5.digest('base64'), options.headers.get('content-md5'));
  verified++;
  return new Response(null, { status: 200 });
};
const dir = await mkdtemp('/tmp/pm-large-upload-');
const socketPath = `${dir}/s.sock`;
const store = await createOciObjectStore({ authenticationDetailsProvider: null, region: 'ap-chuncheon-1' });
const server = createObjectBrokerServer({ config: { namespace: 'ns', bucket: 'bucket' }, store });
server.listen(socketPath); await once(server, 'listening');
const ref = { scope: 'recordings', project: 'p', slug: 'synthetic', sha256: expected, bytes: size };
const path = '/v1/objects/' + Buffer.from(JSON.stringify(ref)).toString('base64url');
function request(upload) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path, method: upload ? 'PUT' : 'DELETE', agent: false,
      headers: upload ? { 'Content-Length': String(size), 'Content-Type': 'audio/mp4' } : {} }, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode)); res.once('error', reject);
    });
    req.once('error', reject);
    (async () => {
      if (upload) for (let i = 0; i < size / chunk.length; i++) if (!req.write(chunk)) await once(req, 'drain');
      req.end();
    })().catch(reject);
  });
}
try {
  const pending = Array.from({ length: 4 }, () => request(true));
  await ready;
  sample();
  assert.equal(await request(false), 503, 'fifth request must not start more buffered work');
  release();
  assert.deepEqual(await Promise.all(pending), [201, 201, 201, 201]);
  assert.equal(verified, 4);
  sample();
  assert.ok(peak < 850 * 1024 * 1024, `RSS exceeds broker memory headroom: ${peak}`);
  console.log(JSON.stringify({ verified, bytesEach: size, peakRssMiB: Math.ceil(peak / 1024 / 1024) }));
} finally {
  release(); clearInterval(timer); globalThis.fetch = previous;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
