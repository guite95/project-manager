import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isMainModule } from '../../lib/server/cli-entry.mjs';

// 로컬 전환 정책이다. 모든 제품의 전체 허용 문법을 표현하지 않는다.
const groups = {
  infrastructure_admins: {
    postgresql: ['postgres', 63], mysql_local_root: null, mysql_oci_admin: null,
    redis: ['redis', 64], rabbitmq: ['rabbitmq', 128], minio_root: ['minio', 64], grafana_admin: ['grafana', 64],
  },
  service_accounts: {
    project_management_postgres_runtime: ['postgres', 63], project_management_postgres_migration: ['postgres', 63],
    flight_postgres_runtime: ['postgres', 63], flight_postgres_migration: ['postgres', 63],
    ilchul_mysql_runtime: ['mysql-local', 32], ilchul_mysql_migration: ['mysql-local', 32],
    ilchul_redis: ['redis', 64], ilchul_minio: ['minio', 64],
    youtube_mysql_runtime: ['mysql-oci', 32], youtube_mysql_migration: ['mysql-oci', 32],
    youtube_backend_redis: ['redis', 64], youtube_media_redis: ['redis', 64],
  },
  application_signing_secrets: {
    project_management_legacy_session: null, flight_session: null, ilchul_jwt: null,
    youtube_jwt_access: null, youtube_jwt_refresh: null, youtube_media_shared: null,
  },
  external_reissuance: {
    flight_smtp: null, flight_kakao_client: null, flight_google_oauth_client: null,
    ilchul_google_api: null, ilchul_tour_api: null, ilchul_anthropic_api: null,
    ilchul_google_oauth_client: null, ilchul_kakao_oauth_client: null, ilchul_naver_oauth_client: null,
  },
};
export const credentialFields = Object.freeze(Object.entries(groups).flatMap(([group, accounts]) =>
  Object.entries(accounts).flatMap(([account, identity]) => {
    const prefix = `${group}.${account}`;
    if (group === 'application_signing_secrets' || group === 'external_reissuance') {
      return [{ path: `${prefix}.${account === 'flight_smtp' ? 'new_password' : 'new_secret'}`, kind: 'retained' }];
    }
    const minioService = account === 'ilchul_minio';
    return [
      ...(identity ? [{ path: `${prefix}.${minioService ? 'new_access_key' : 'new_username'}`, kind: 'username', server: identity[0], max: identity[1] }] : []),
      { path: `${prefix}.${minioService ? 'new_secret_key' : 'new_password'}`, kind: 'password' },
    ];
  })).map(Object.freeze));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.hasOwn(value, key);

export function validateCredentialInput(input) {
  const issues = [];
  const issue = (path, code) => issues.push({ path, code });
  let suppliedFields = 0;
  const result = () => ({ ok: issues.length === 0, suppliedFields, newPasswords: 19, retainedSecrets: 15, issues });
  if (!object(input)) { issue('$', 'SCHEMA'); return result(); }
  const checkKeys = (value, allowed, path) => {
    // 알 수 없는 키 자체도 비밀일 수 있으므로 고정된 경로만 출력한다.
    if (Object.keys(value).some(key => !allowed.includes(key))) issue(path, 'UNKNOWN_FIELD');
  };
  checkKeys(input, [...Object.keys(groups), '_instructions'], '$');
  if (has(input, '_instructions') && !object(input._instructions)) issue('$', 'METADATA');
  for (const [group, accounts] of Object.entries(groups)) {
    if (!object(input[group])) { issue(group, 'SCHEMA'); continue; }
    checkKeys(input[group], [...Object.keys(accounts), '_note'], group);
    if (has(input[group], '_note') && typeof input[group]._note !== 'string') issue(group, 'METADATA');
    for (const account of Object.keys(accounts)) {
      const path = `${group}.${account}`;
      const value = input[group][account];
      if (!object(value)) { issue(path, 'SCHEMA'); continue; }
      const keys = credentialFields.filter(f => f.path.startsWith(`${path}.`)).map(f => f.path.split('.')[2]);
      const fixedRoot = group === 'infrastructure_admins' && account === 'mysql_local_root';
      checkKeys(value, [...keys, '_note', '_suggested_username', ...(fixedRoot ? ['fixed_username'] : [])], path);
      if (fixedRoot && value.fixed_username !== 'root') issue(path, 'FIXED_IDENTITY');
      for (const meta of ['_note', '_suggested_username']) {
        if (has(value, meta) && typeof value[meta] !== 'string') issue(path, 'METADATA');
      }
    }
  }
  const passwords = new Map();
  const usernames = new Map();
  const retained = new Set();
  for (const field of credentialFields) {
    const [group, account, key] = field.path.split('.');
    const value = input[group]?.[account]?.[key];
    if (typeof value !== 'string' || value.trim().length === 0) { issue(field.path, 'REQUIRED_STRING'); continue; }
    suppliedFields++;
    if (field.kind === 'retained') {
      // 명시적으로 유지한 키는 회전/보안성 검증 완료로 취급하지 않는다.
      if (Buffer.byteLength(value) > 65536 || /[\x00-\x1f\x7f]/.test(value)) issue(field.path, 'SECRET_FORMAT');
      retained.add(value);
    } else if (field.kind === 'username') {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value) || value.length > field.max || (field.server === 'minio' && value.length < 3)) {
        issue(field.path, 'USERNAME_POLICY');
      }
      const identity = `${field.server}:${value.toLowerCase()}`;
      if (usernames.has(identity)) issue(field.path, 'USERNAME_COLLISION');
      usernames.set(identity, field.path);
    } else {
      if (value.length < 12 || value.length > 32 || !/^[\x21-\x7e]+$/.test(value)
        || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
        issue(field.path, 'PASSWORD_POLICY');
      }
      if (passwords.has(value)) issue(field.path, 'PASSWORD_REUSE');
      passwords.set(value, field.path);
    }
  }
  for (const [value, path] of passwords) if (retained.has(value)) issue(path, 'RETAINED_SECRET_REUSE');
  return result();
}

export async function readCredentialInput(inputPath) {
  let handle;
  try {
    const path = resolve(inputPath);
    const parent = await lstat(dirname(path));
    if (!parent.isDirectory() || parent.uid !== process.getuid() || (parent.mode & 0o777) !== 0o700) throw new Error();
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    const limit = 262144;
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600 || info.size > limit) throw new Error();
    const buffer = Buffer.alloc(limit + 1);
    let bytes = 0;
    try {
      while (bytes < buffer.length) {
        const chunk = await handle.read(buffer, bytes, buffer.length - bytes, null);
        if (!chunk.bytesRead) break;
        bytes += chunk.bytesRead;
      }
      if (bytes > limit) throw new Error();
      const credentials = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes)));
      return { credentials, report: validateCredentialInput(credentials) };
    } finally { buffer.fill(0); }
  } catch { throw new Error('CREDENTIAL_INPUT_UNREADABLE'); }
  finally { if (handle) await handle.close().catch(() => {}); }
}

if (isMainModule(import.meta.url)) {
  let report;
  try {
    if (process.argv.length > 3) throw new Error();
    ({ report } = await readCredentialInput(process.argv[2] ?? '.private/oci-vault-credentials.json'));
  } catch { report = { ok: false, issues: [{ path: '$', code: 'CREDENTIAL_INPUT_UNREADABLE' }] }; }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}
