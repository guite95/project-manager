import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { credentialFields, validateCredentialInput, readCredentialInput } from './credential-input.mjs';

function fixture() {
  const input = { _instructions: { reminder: 'Synthetic fixture only' } };
  for (const [index, field] of credentialFields.entries()) {
    const [group, account, key] = field.path.split('.');
    input[group] ??= {};
    input[group][account] ??= { _note: 'Fixture' };
    input[group][account][key] = field.kind === 'username' ? `fixture_${index}`
      : field.kind === 'password' ? `Fixture!${index}Password` : `existing-fixture-${index}`;
  }
  input.infrastructure_admins.mysql_local_root.fixed_username = 'root';
  input.application_signing_secrets._note = 'Preserve existing values';
  input.external_reissuance._note = 'Preserve existing values';
  return input;
}
function set(input, path, value) {
  const [group, account, key] = path.split('.');
  input[group][account][key] = value;
}
async function fileFixture(t, contents = JSON.stringify(fixture())) {
  const dir = await mkdtemp('/tmp/pm-credential-input-');
  t.after(() => rm(dir, { recursive: true, force: true }));
  await chmod(dir, 0o700);
  const path = `${dir}/input.json`;
  await writeFile(path, contents, { mode: 0o600 });
  return { dir, path };
}

test('fixed schema distinguishes 19 rotated passwords and 15 retained secrets in 51 fields', () => {
  assert.equal(credentialFields.length, 51);
  assert.deepEqual(validateCredentialInput(fixture()), {
    ok: true, suppliedFields: 51, newPasswords: 19, retainedSecrets: 15, issues: [],
  });
});
test('missing, malformed, unknown fields and metadata never echo input', () => {
  const sentinel = 'SENSITIVE_FIXTURE_DO_NOT_ECHO';
  for (const mutate of [
    input => { input[sentinel] = sentinel; },
    input => { input.service_accounts[sentinel] = { new_password: sentinel }; },
    input => { input.service_accounts.ilchul_redis[sentinel] = sentinel; },
    input => { input.service_accounts.ilchul_redis.new_password = { [sentinel]: sentinel }; },
    input => { delete input.service_accounts.ilchul_redis.new_password; },
    input => { input.service_accounts.ilchul_redis.new_password = ' '; },
    input => { input.service_accounts.ilchul_redis._note = { [sentinel]: sentinel }; },
    input => { input.infrastructure_admins.mysql_local_root.fixed_username = sentinel; },
    input => { input.application_signing_secrets._note = { [sentinel]: sentinel }; },
  ]) {
    const input = fixture(); mutate(input);
    const result = validateCredentialInput(input);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(sentinel));
  }
  for (const input of [null, [], 'secret', 42]) assert.equal(validateCredentialInput(input).ok, false);
});
test('new passwords require local policy, uniqueness and separation from retained keys', () => {
  for (const password of ['short', 'a'.repeat(16), 'Aa1!' + 'x'.repeat(29), 'Bad\nPassword1!']) {
    const input = fixture(); set(input, 'service_accounts.ilchul_redis.new_password', password);
    assert.ok(validateCredentialInput(input).issues.some(i => i.code === 'PASSWORD_POLICY'));
  }
  const input = fixture();
  input.service_accounts.ilchul_redis.new_password = input.infrastructure_admins.redis.new_password;
  assert.ok(validateCredentialInput(input).issues.some(i => i.code === 'PASSWORD_REUSE'));
  const retained = fixture();
  retained.external_reissuance.flight_smtp.new_password = retained.infrastructure_admins.redis.new_password;
  assert.ok(validateCredentialInput(retained).issues.some(i => i.code === 'RETAINED_SECRET_REUSE'));
});
test('same-server users must differ but identities on different servers may match', () => {
  const input = fixture();
  input.service_accounts.youtube_media_redis.new_username = input.service_accounts.youtube_backend_redis.new_username;
  assert.ok(validateCredentialInput(input).issues.some(i => i.code === 'USERNAME_COLLISION'));
  const separate = fixture();
  separate.service_accounts.ilchul_mysql_runtime.new_username = separate.service_accounts.youtube_mysql_runtime.new_username;
  assert.equal(validateCredentialInput(separate).ok, true);
});
test('username constraints reject SQL, URL, ACL metacharacters and overlong names', () => {
  for (const name of ["x' OR 1=1", 'root@host', '*', 'x'.repeat(33), 'user\nother']) {
    const input = fixture(); set(input, 'service_accounts.ilchul_mysql_runtime.new_username', name);
    assert.ok(validateCredentialInput(input).issues.some(i => i.code === 'USERNAME_POLICY'));
  }
});
test('secure reader accepts protected regular input without altering it', async t => {
  const { path } = await fileFixture(t);
  const result = await readCredentialInput(path);
  assert.equal(result.report.ok, true);
  assert.deepEqual(result.credentials, fixture());
});
test('secure reader rejects symlinks, shared permissions and malformed or oversized JSON safely', async t => {
  const f = await fileFixture(t);
  const safe = error => error.message === 'CREDENTIAL_INPUT_UNREADABLE' && error.cause === undefined;
  await symlink(f.path, `${f.dir}/link`);
  await assert.rejects(readCredentialInput(`${f.dir}/link`), safe);
  await chmod(f.path, 0o644); await assert.rejects(readCredentialInput(f.path), safe);
  await chmod(f.path, 0o600); await chmod(f.dir, 0o750); await assert.rejects(readCredentialInput(f.path), safe);
  await chmod(f.dir, 0o700);
  await writeFile(f.path, '{"SENSITIVE_FIXTURE":'); await assert.rejects(readCredentialInput(f.path), safe);
  await writeFile(f.path, 'x'.repeat(262145)); await assert.rejects(readCredentialInput(f.path), safe);
});
test('CLI reports only safe results and exits nonzero for invalid input', async t => {
  const f = await fileFixture(t);
  const run = () => spawnSync(process.execPath, ['ops/oci-runtime/credential-input.mjs', f.path], { encoding: 'utf8' });
  const good = run(); assert.equal(good.status, 0); assert.equal(good.stderr, '');
  assert.ok(!good.stdout.includes('Fixture!'));
  await writeFile(f.path, '{"SENSITIVE_FIXTURE":');
  const bad = run(); assert.equal(bad.status, 1); assert.equal(bad.stderr, '');
  assert.ok(!bad.stdout.includes('SENSITIVE_FIXTURE'));
  assert.equal(JSON.parse(bad.stdout).issues[0].code, 'CREDENTIAL_INPUT_UNREADABLE');
});
