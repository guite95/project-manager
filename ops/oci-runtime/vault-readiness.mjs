import { statfs, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createSecretReader } from '../../lib/server/runtime-secrets.mjs';

export function checkVaultReadiness({ directory, ownerUid = 0 }) {
  try {
    const read = createSecretReader({ directory, ownerUid });
    const url = new URL(read('DATABASE_URL'));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || decodeURIComponent(url.pathname) !== '/project_management'
      || !url.username || !url.password || !read('SESSION_SECRET')) throw new Error();
    return true;
  } catch { throw new Error('VAULT_NOT_READY'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const directory = '/run/oci-service-secrets/project-management';
    if (process.getuid() !== 0 || process.argv.length !== 2 || (await statfs(directory)).type !== 0x01021994
      || (await readFile('/proc/swaps', 'utf8')).trim().split('\n').length !== 1) throw new Error();
    checkVaultReadiness({ directory });
  } catch { process.stderr.write('VAULT_NOT_READY\n'); process.exitCode = 1; }
}
