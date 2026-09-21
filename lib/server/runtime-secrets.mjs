import { constants, openSync, closeSync, fstatSync, readSync, lstatSync, readlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const required = ['DATABASE_URL', 'SESSION_SECRET'];
const names = [...required, 'APP_PASSWORD_HASH'];
const profiles = { runtime: { required, names }, migration: { required: ['DATABASE_URL'], names: ['DATABASE_URL'] } };

/** Pin all settings to one immutable generation. Rotation requires a process restart. */
export function createSecretReader({ directory, ownerUid = 0, profile = 'runtime' }) {
  let values;
  return name => {
    try {
      const settings = Object.hasOwn(profiles, profile) && profiles[profile];
      if (!settings || !settings.names.includes(name)) throw new Error();
      if (!values) {
        if (typeof directory !== 'string' || !isAbsolute(directory)) throw new Error();
        const parent = lstatSync(directory);
        if (!parent.isDirectory() || parent.uid !== ownerUid || (parent.mode & 0o777) !== 0o750) throw new Error();
        const link = lstatSync(join(directory, 'current'));
        if (!link.isSymbolicLink() || link.uid !== ownerUid) throw new Error();
        const target = readlinkSync(join(directory, 'current'));
        if (!/^g-[A-Za-z0-9]{6}$/.test(target)) throw new Error();
        const generation = join(directory, target), stat = lstatSync(generation);
        if (!stat.isDirectory() || stat.uid !== ownerUid || stat.gid !== parent.gid || (stat.mode & 0o777) !== 0o750) throw new Error();
        const pending = {};
        for (const key of settings.names) {
          let fd;
          try { fd = openSync(join(generation, key), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
          catch (error) { if (error.code === 'ENOENT' && !settings.required.includes(key)) continue; throw error; }
          const bytes = Buffer.alloc(65537);
          try {
            const file = fstatSync(fd);
            if (!file.isFile() || file.uid !== ownerUid || file.gid !== parent.gid || (file.mode & 0o777) !== 0o640 || file.nlink !== 1 || file.size < 1 || file.size > 65536) throw new Error();
            let count = 0, size;
            do { size = readSync(fd, bytes, count, bytes.length - count, null); count += size; } while (size && count < bytes.length);
            if (count !== file.size || count > 65536 || bytes.subarray(0, count).includes(0)) throw new Error();
            pending[key] = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
          } finally { bytes.fill(0); closeSync(fd); }
        }
        values = pending;
      }
      return values[name];
    } catch { throw new Error('RUNTIME_SECRET_UNAVAILABLE'); }
  };
}

let runtimeReader;
export function getRuntimeSecret(name) {
  if (!names.includes(name)) throw new Error('RUNTIME_SECRET_UNAVAILABLE');
  // Presence, not truthiness: an empty/broken file-mode setting must not enable env fallback.
  if (Object.hasOwn(process.env, 'PM_SECRET_DIRECTORY')) {
    runtimeReader ??= createSecretReader({ directory: process.env.PM_SECRET_DIRECTORY });
    return runtimeReader(name);
  }
  return process.env[name];
}

let migrationReader;
export function getMigrationDatabaseUrl() {
  if (Object.hasOwn(process.env, 'PM_MIGRATION_SECRET_DIRECTORY')) {
    migrationReader ??= createSecretReader({ directory: process.env.PM_MIGRATION_SECRET_DIRECTORY, profile: 'migration' });
    return migrationReader('DATABASE_URL');
  }
  if (Object.hasOwn(process.env, 'PM_SECRET_DIRECTORY')) throw new Error('MIGRATION_SECRET_REQUIRED');
  return process.env.DATABASE_URL;
}
