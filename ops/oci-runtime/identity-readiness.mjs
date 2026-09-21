import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import { createGoogleRuntimeAuth } from '../../lib/server/google-runtime-auth.mjs';

export async function checkIdentityReadiness({
  brokerDirectory = '/run/project-management-broker', tokenDirectory = '/run/project-management-google',
  expectedUid = 0, expectedGid,
}) {
  try {
    if (!Number.isSafeInteger(expectedGid) || expectedGid < 0) throw new Error();
    async function check(path, kind, mode) {
      const s = await lstat(path);
      if (!s[kind]() || s.uid !== expectedUid || s.gid !== expectedGid || (s.mode & 0o777) !== mode) throw new Error();
    }
    await check(brokerDirectory, 'isDirectory', 0o750);
    await check(tokenDirectory, 'isDirectory', 0o750);
    const socketPath = join(brokerDirectory, 'storage.sock');
    const tokenPath = join(tokenDirectory, 'access-token.json');
    await check(socketPath, 'isSocket', 0o660);
    await check(tokenPath, 'isFile', 0o640);
    await createGoogleRuntimeAuth({ GOOGLE_ACCESS_TOKEN_FILE: tokenPath }).getRequestHeaders();
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      const timer = setTimeout(() => { socket.destroy(); reject(new Error()); }, 2000);
      socket.once('error', reject);
      socket.once('close', () => clearTimeout(timer));
      socket.once('connect', () => { socket.destroy(); resolve(); });
    });
    return true;
  } catch { throw new Error('IDENTITY_BOUNDARY_NOT_READY'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3 || !/^\d+$/.test(process.argv[2])) throw new Error();
    await checkIdentityReadiness({ expectedGid: Number(process.argv[2]) });
  } catch { process.stderr.write('IDENTITY_BOUNDARY_NOT_READY\n'); process.exitCode = 1; }
}
