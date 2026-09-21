import { constants } from 'node:fs';
import { open, lstat, mkdir, chown, statfs, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncSecrets, validateManifest } from './vault-secrets.mjs';
import { createVaultClient } from './vault-client.mjs';

export async function readRuntimeManifest(path, ownerUid = 0) {
  let file;
  try {
    const parent = await lstat(dirname(path));
    if (!parent.isDirectory() || parent.uid !== ownerUid || (parent.mode & 0o022)) throw new Error();
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== ownerUid || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size < 1 || stat.size > 16384) throw new Error();
    const bytes = Buffer.alloc(16385);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size || bytesRead > 16384) throw new Error();
    const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead)));
    validateManifest(manifest);
    return manifest;
  } catch { throw new Error('VAULT_RUNTIME_CONFIGURATION'); }
  finally { await file?.close(); }
}

export async function prepareRuntimeDirectory({ rootDirectory, manifest }) {
  try {
    validateManifest(manifest);
    if (process.getuid() !== 0 || !isAbsolute(rootDirectory)) throw new Error();
    // Check all ancestors before any mkdir: no symlink or writable trust boundary.
    let ancestor = dirname(rootDirectory);
    while (true) {
      const stat = await lstat(ancestor);
      if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022)) throw new Error();
      if (ancestor === '/') break;
      ancestor = dirname(ancestor);
    }
    if ((await statfs(dirname(rootDirectory))).type !== 0x01021994) throw new Error();
    if ((await readFile('/proc/swaps', 'utf8')).trim().split('\n').length !== 1) throw new Error();
    const root = await lstat(rootDirectory).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (root) {
      if (!root.isDirectory() || root.uid !== 0 || root.gid !== 0 || (root.mode & 0o777) !== 0o711) throw new Error();
    } else {
      await mkdir(rootDirectory, { mode: 0o711 });
      await chown(rootDirectory, 0, 0);
      // mkdir is affected by the unit's restrictive umask.
      const { chmod } = await import('node:fs/promises'); await chmod(rootDirectory, 0o711);
    }
    if ((await statfs(rootDirectory)).type !== 0x01021994) throw new Error();
    const path = join(rootDirectory, manifest.service);
    const existing = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (!existing) {
      await mkdir(path, { mode: 0o750 }); await chown(path, 0, manifest.gid);
      const { chmod } = await import('node:fs/promises'); await chmod(path, 0o750);
    }
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.uid !== 0 || stat.gid !== manifest.gid || (stat.mode & 0o777) !== 0o750) throw new Error();
  } catch { throw new Error('VAULT_RUNTIME_CONFIGURATION'); }
}

async function main() {
  if (process.getuid() !== 0 || process.argv.length > 3 || (process.argv[2] !== undefined && process.argv[2] !== '--migration')) throw new Error();
  const service = process.argv[2] === '--migration' ? 'project-management-migration' : 'project-management';
  const manifest = await readRuntimeManifest(`/etc/oci-service-secrets/${service}.json`);
  if (manifest.service !== service) throw new Error();
  const rootDirectory = '/run/oci-service-secrets';
  await prepareRuntimeDirectory({ rootDirectory, manifest });
  const common = await import('oci-common');
  const authenticationDetailsProvider = await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
  const client = await createVaultClient({ authenticationDetailsProvider, region: 'ap-chuncheon-1' });
  await syncSecrets({ manifest, client, rootDirectory });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // No SDK detail or secret-bearing exception enters journald; unit status is the signal.
  main().catch(() => { process.exitCode = 1; });
}
