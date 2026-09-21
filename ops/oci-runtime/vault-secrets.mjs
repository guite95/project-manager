import { lstat, mkdir, mkdtemp, open, chmod, chown, readlink, symlink, rename, rm, unlink, rmdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// PM pilot only. Other service profiles are added after their actual consumers are verified.
const profiles = Object.freeze({ 'project-management': {
  required: ['DATABASE_URL', 'SESSION_SECRET'], optional: ['APP_PASSWORD_HASH'],
} });
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function validateManifest(manifest) {
  if (!exactKeys(manifest, ['service', 'gid', 'files'])) throw new Error();
  const profile = Object.hasOwn(profiles, manifest.service) && profiles[manifest.service];
  if (!profile || !Number.isSafeInteger(manifest.gid) || manifest.gid < 0 || !Array.isArray(manifest.files)) throw new Error();
  const allowed = [...profile.required, ...profile.optional];
  if (manifest.files.length > allowed.length) throw new Error();
  const names = new Set();
  for (const entry of manifest.files) {
    if (!exactKeys(entry, ['name', 'secretId', 'versionNumber']) || !allowed.includes(entry.name) || names.has(entry.name)
      || !/^ocid1\.vaultsecret\.oc1\.[a-z]+-[a-z0-9]+-\d+\.[a-zA-Z0-9]+$/.test(entry.secretId ?? '')
      || !Number.isSafeInteger(entry.versionNumber) || entry.versionNumber < 1) throw new Error();
    names.add(entry.name);
  }
  if (!profile.required.every(name => names.has(name))) throw new Error();
}

// Caller must use a root-owned, validated fixed manifest and a tmpfs runtime root.
// This function never creates IAM policies or falls back to another Secret/version.
export async function syncSecrets({ manifest, client, rootDirectory }) {
  let lock, generation, pendingLink, published = false;
  const values = [];
  try {
    validateManifest(manifest);
    if (!isAbsolute(rootDirectory)) throw new Error();
    const root = await lstat(rootDirectory);
    if (!root.isDirectory() || root.uid !== process.getuid() || (root.mode & 0o022)) throw new Error();
    const dir = join(rootDirectory, manifest.service);
    const parent = await lstat(dir);
    if (!parent.isDirectory() || parent.uid !== process.getuid() || parent.gid !== manifest.gid || (parent.mode & 0o777) !== 0o750) throw new Error();
    const lockPath = join(dir, '.sync-lock');
    await mkdir(lockPath, { mode: 0o700 }); lock = lockPath;
    const current = join(dir, 'current');
    const existing = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (existing) {
      if (!existing.isSymbolicLink() || existing.uid !== process.getuid()) throw new Error();
      const target = await readlink(current);
      if (!/^g-[A-Za-z0-9]{6}$/.test(target)) throw new Error();
      const s = await lstat(join(dir, target));
      if (!s.isDirectory() || s.uid !== process.getuid() || s.gid !== manifest.gid || (s.mode & 0o777) !== 0o750) throw new Error();
    }
    // Fetch/validate all files before creating or switching any generation.
    for (const file of manifest.files) {
      const { secretBundle: bundle } = await client.getSecretBundle({ secretId: file.secretId, versionNumber: file.versionNumber });
      if (bundle?.secretId !== file.secretId || bundle.versionNumber !== file.versionNumber
        || !Array.isArray(bundle.stages) || !bundle.stages.includes('CURRENT')
        || bundle.stages.some(stage => !['CURRENT', 'LATEST'].includes(stage))
        || bundle.secretBundleContent?.contentType !== 'BASE64') throw new Error();
      if (bundle.timeOfDeletion != null) throw new Error();
      if (bundle.timeOfExpiry != null && !(new Date(bundle.timeOfExpiry).getTime() > Date.now() + 60_000)) throw new Error();
      const encoded = bundle.secretBundleContent.content;
      if (typeof encoded !== 'string' || !encoded.length || encoded.length > 87384) throw new Error();
      const bytes = Buffer.from(encoded, 'base64');
      if (!bytes.length || bytes.length > 65536 || bytes.toString('base64') !== encoded || bytes.includes(0)) throw new Error();
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      values.push({ name: file.name, bytes });
    }
    generation = await mkdtemp(join(dir, 'g-'));
    await chown(generation, process.getuid(), manifest.gid);
    for (const value of values) {
      const file = await open(join(generation, value.name), 'wx', 0o600);
      try {
        await file.writeFile(value.bytes); await file.chown(process.getuid(), manifest.gid);
        await file.chmod(0o640); await file.sync();
      } finally { await file.close(); }
    }
    await chmod(generation, 0o750);
    pendingLink = join(dir, `.current-${randomUUID()}`);
    await symlink(generation.slice(dir.length + 1), pendingLink);
    await rename(pendingLink, current); pendingLink = undefined; published = true;
    return { service: manifest.service, files: values.length };
  } catch { throw new Error('VAULT_SECRET_SYNC_FAILED'); }
  finally {
    for (const value of values) value.bytes.fill(0);
    if (pendingLink) await unlink(pendingLink).catch(() => {});
    if (generation && !published) await rm(generation, { recursive: true, force: true }).catch(() => {});
    if (lock) await rmdir(lock).catch(() => {});
  }
}
