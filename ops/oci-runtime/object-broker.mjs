import http from 'node:http';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { parseBrokerRoute, validateBrokerReference } from '../../lib/server/object-storage-broker-protocol.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
async function collect(stream, size) {
  const chunks = []; let count = 0;
  for await (const chunk of stream) {
    const b = Buffer.from(chunk); count += b.length;
    if (count > size) { stream.destroy(); throw new Error(); }
    chunks.push(b);
  }
  if (count !== size) throw new Error();
  return Buffer.concat(chunks, count);
}

export function createObjectBrokerServer({ config, store, maxConcurrent = 4, timeoutMs = 60_000 }) {
  if (!config || !/^[a-zA-Z0-9_-]+$/.test(config.namespace ?? '') || !/^[a-zA-Z0-9_.-]+$/.test(config.bucket ?? '') ||
      !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 8 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('OBJECT_BROKER_CONFIGURATION');
  // Copy fixed configuration so a caller cannot change the bucket during a request.
  const fixed = { namespaceName: config.namespace, bucketName: config.bucket };
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: timeoutMs, headersTimeout: timeoutMs }, async (req, res) => {
    const reply = status => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(status, { 'Content-Length': '0', Connection: 'close' });
      res.end();
    };
    let ref, key;
    try { ref = parseBrokerRoute(req.url); key = validateBrokerReference(ref); }
    catch { reply(400); return; }
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) { reply(405); return; }
    const length = req.headers['content-length'];
    if (req.headers['transfer-encoding'] || (req.method === 'PUT'
      ? length !== String(ref.bytes)
      : length !== undefined && length !== '0')) { reply(400); return; }
    if (active >= maxConcurrent) { reply(503); return; }
    active++;
    let ended = false, stream;
    const controller = new AbortController();
    const abort = () => { ended = true; controller.abort(); stream?.destroy(); };
    const timer = setTimeout(() => { reply(504); abort(); }, timeoutMs);
    // Request timeout covers slow body producers; do not leave their input running.
    res.on('close', abort);
    const args = { ...fixed, objectName: key, abortSignal: controller.signal };
    try {
      if (req.method === 'PUT') {
        stream = req;
        const contentType = req.headers['content-type'] ?? 'application/octet-stream';
        if (!/^[\x20-\x7e]{1,128}$/.test(contentType)) { reply(400); return; }
        let body;
        try { body = await collect(req, ref.bytes); }
        catch { reply(400); return; }
        if (sha256(body) !== ref.sha256) { reply(400); return; }
        if (ended) return;
        stream = undefined;
        await store.putObject({ ...args, putObjectBody: body, contentLength: body.length, contentType,
          ifNoneMatch: '*', contentMD5: createHash('md5').update(body).digest('base64') });
        if (!ended) reply(201);
      } else if (req.method === 'GET') {
        const response = await store.getObject(args);
        stream = response.value?.getReader ? Readable.fromWeb(response.value) : response.value;
        if (ended || response.contentLength !== ref.bytes) { stream?.destroy(); if (!ended) reply(502); return; }
        const bytes = await collect(stream, ref.bytes);
        if (ended) return;
        if (sha256(bytes) !== ref.sha256) { reply(502); return; }
        res.writeHead(200, { 'Content-Length': String(bytes.length), 'Content-Type': 'application/octet-stream', Connection: 'close' });
        // Backpressure/slow readers hold the slot until response completion or timeout.
        await new Promise(resolve => { res.once('close', resolve); res.end(bytes, resolve); });
      } else {
        await store.deleteObject(args);
        if (!ended) reply(204);
      }
    } catch (error) {
      if (!ended) reply([404, 412].includes(error?.statusCode) ? error.statusCode : 502);
    } finally {
      clearTimeout(timer); stream?.destroy();
      res.removeListener('close', abort);
      // SDK calls cannot all be cancelled. Release only when actual work has settled.
      active--;
    }
  });
  server.maxConnections = 32;
  server.maxRequestsPerSocket = 1;
  server.setTimeout(timeoutMs, socket => socket.destroy());
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  return server;
}
