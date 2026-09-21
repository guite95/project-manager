import { lstat, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import { randomUUID } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';

export async function publishGoogleToken({ auth, outputPath, now = Date.now }) {
  let temporary, file;
  try {
    if (typeof outputPath !== 'string' || !isAbsolute(outputPath)) throw new Error();
    const dir = dirname(outputPath), parent = await lstat(dir);
    if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid() || (parent.mode & 0o022)) throw new Error();
    const existing = await lstat(outputPath).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (existing && (!existing.isFile() || existing.uid !== process.getuid() || (existing.mode & 0o022))) throw new Error();
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    const expiry_date = client.credentials?.expiry_date;
    if (typeof token !== 'string' || token.length > 15_000 || !/^[A-Za-z0-9._~+/-]+=*$/.test(token) ||
        !Number.isSafeInteger(expiry_date) || expiry_date < now() + 60_000) throw new Error();
    const data = JSON.stringify({ access_token: token, expiry_date });
    if (Buffer.byteLength(data) > 16 * 1024) throw new Error();
    temporary = join(dir, `.token-${randomUUID()}`);
    file = await open(temporary, 'wx', 0o600);
    await file.writeFile(data); await file.chmod(0o640); await file.sync(); await file.close(); file = undefined;
    await rename(temporary, outputPath); temporary = undefined;
  } catch { throw new Error('GOOGLE_TOKEN_PUBLICATION_FAILED'); }
  finally {
    await file?.close().catch(() => {});
    if (temporary) await unlink(temporary).catch(() => {});
  }
}

if (isMainModule(import.meta.url)) {
  try {
    // These are host-only fixed paths; never mount the ADC/certificate directory in apps.
    const auth = new GoogleAuth({ keyFilename: '/run/project-management-wif/adc.json', scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    await publishGoogleToken({ auth, outputPath: '/run/project-management-google/access-token.json' });
  } catch { process.stderr.write('GOOGLE_TOKEN_PUBLICATION_FAILED\n'); process.exitCode = 1; }
}
