import http from 'node:http';
import { isAbsolute } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { brokerRoute, validateBrokerReference } from './object-storage-broker-protocol.mjs';

function failure(statusCode) {
  const error = new Error('OBJECT_BROKER_REQUEST_FAILED');
  if ([404, 412].includes(statusCode)) error.statusCode = statusCode;
  return error;
}

export function createObjectBrokerClient(socketPath) {
  if (typeof socketPath !== 'string' || !isAbsolute(socketPath) || socketPath.includes('\0')) throw new Error('OBJECT_BROKER_CONFIGURATION');
  async function request(method, options) {
    const ref = options.brokerReference;
    let path;
    try {
      if (options.objectName !== validateBrokerReference(ref)) throw new Error();
      path = brokerRoute(ref);
      if (method === 'PUT' && (!Buffer.isBuffer(options.putObjectBody) || options.putObjectBody.length !== ref.bytes || options.contentLength !== ref.bytes || options.ifNoneMatch !== '*')) throw new Error();
      if (method === 'PUT' && !/^[\x20-\x7e]{1,128}$/.test(options.contentType ?? 'application/octet-stream')) throw new Error();
    } catch { throw failure(); }
    return new Promise((resolve, reject) => {
      let timer;
      const req = http.request({ socketPath, path, method, agent: false, maxHeaderSize: 8192,
        headers: method === 'PUT' ? { 'Content-Length': String(ref.bytes), 'Content-Type': options.contentType ?? 'application/octet-stream' } : {},
      }, res => {
        if (res.statusCode !== ({ GET: 200, PUT: 201, DELETE: 204 })[method]) {
          res.destroy(); reject(failure(res.statusCode)); return;
        }
        const expected = method === 'GET' ? ref.bytes : 0;
        if (res.headers['content-length'] !== String(expected) || res.headers['transfer-encoding']) { res.destroy(); reject(failure()); return; }
        const chunks = []; let length = 0;
        res.on('data', chunk => {
          length += chunk.length;
          if (length > expected) { res.destroy(); reject(failure()); } else chunks.push(chunk);
        });
        res.on('error', () => reject(failure()));
        res.on('end', () => {
          const bytes = Buffer.concat(chunks, length);
          if (length !== expected || (method === 'GET' && createHash('sha256').update(bytes).digest('hex') !== ref.sha256)) { reject(failure()); return; }
          resolve(method === 'GET' ? { value: Readable.from([bytes]), contentLength: length } : {});
        });
      });
      req.on('error', () => reject(failure()));
      req.on('close', () => clearTimeout(timer));
      timer = setTimeout(() => { req.destroy(); reject(failure()); }, 65_000);
      req.end(method === 'PUT' ? options.putObjectBody : undefined);
    });
  }
  return { getObject: options => request('GET', options), putObject: options => request('PUT', options), deleteObject: options => request('DELETE', options) };
}
