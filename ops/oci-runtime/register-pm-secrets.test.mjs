import test from 'node:test';
import assert from 'node:assert/strict';

test('registration separates runtime and migration URLs, preserves topology and requires matching retained secrets', async () => {
  const { buildPmSecretEntries } = await import('./register-pm-secrets.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof buildPmSecretEntries, 'function');
  const input = {
    service_accounts: {
      project_management_postgres_runtime: { new_username: 'fixture_runtime', new_password: 'Fixture%@:/?#1' },
      project_management_postgres_migration: { new_username: 'fixture_migration', new_password: 'FixtureOther%@2' },
    },
    application_signing_secrets: { project_management_legacy_session: { new_secret: 'fixture-session' } },
  };
  const existing = { DATABASE_URL: 'postgresql://old:fixture@postgresql:5432/project_management?schema=public', SESSION_SECRET: 'fixture-session', APP_PASSWORD_HASH: 'fixture-bootstrap-hash' };
  const result = buildPmSecretEntries(input, existing);
  assert.equal(result.length, 4);
  const runtime = new URL(result.find(x => x.name === 'pm-runtime-database-url').value);
  const migration = new URL(result.find(x => x.name === 'pm-migration-database-url').value);
  assert.equal(runtime.hostname, 'postgresql'); assert.equal(runtime.port, '5432');
  assert.equal(runtime.pathname, '/project_management'); assert.equal(runtime.search, '?schema=public');
  assert.equal(decodeURIComponent(runtime.username), 'fixture_runtime');
  assert.equal(decodeURIComponent(runtime.password), 'Fixture%@:/?#1');
  assert.equal(decodeURIComponent(migration.username), 'fixture_migration');
  assert.equal(decodeURIComponent(migration.password), 'FixtureOther%@2');
  assert.equal(result.find(x => x.name === 'pm-legacy-session-secret').value, 'fixture-session');
  assert.equal(result.find(x => x.name === 'pm-bootstrap-password-hash').value, 'fixture-bootstrap-hash');
  for (const overrides of [{SESSION_SECRET:'changed'}, {APP_PASSWORD_HASH:''}, {DATABASE_URL:'postgresql://old:fixture@db/other'}, {DATABASE_URL:'postgresql://old:fixture@db/project_management?host=other'}]) {
    assert.throws(() => buildPmSecretEntries(input, {...existing,...overrides}), error => error.message === 'PM_SECRET_REGISTRATION_INPUT_INVALID');
  }
});
