import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFlightSecretEntries } from './register-flight-secrets.mjs';

test('Flight keeps existing signing/OAuth values and separates URL identities', () => {
  const input = {
    service_accounts: {
      flight_postgres_runtime: {new_username:'fixture_runtime',new_password:'FixtureRun%1!'},
      flight_postgres_migration: {new_username:'fixture_migration',new_password:'FixtureMigrate%2!'},
    },
    application_signing_secrets: {flight_session:{new_secret:'fixture-signing'}},
    external_reissuance: {
      flight_smtp:{new_password:'fixture-smtp'},flight_kakao_client:{new_secret:'fixture-kakao'},
      flight_google_oauth_client:{new_secret:'fixture-google'},
    },
  };
  const existing = {DATABASE_URL:'postgresql://fixture_admin:old@postgresql:5432/flight-db',
    SECRET_KEY:'fixture-signing',SMTP_PASSWORD:'fixture-smtp',KAKAO_CLIENT_SECRET:'fixture-kakao',
    KAKAO_REST_API_KEY:'fixture-rest',GOOGLE_CLIENT_CONFIG:JSON.stringify({web:{client_secret:'fixture-google',client_id:'fixture-id'}})};
  const [runtime,migration] = buildFlightSecretEntries(input, existing);
  const config = JSON.parse(runtime.value), runtimeUrl = new URL(config.DATABASE_URL), migrationUrl = new URL(migration.value);
  assert.equal(decodeURIComponent(runtimeUrl.password),'FixtureRun%1!');
  assert.equal(decodeURIComponent(migrationUrl.password),'FixtureMigrate%2!');
  assert.notEqual(runtimeUrl.username,migrationUrl.username);
  assert.equal(runtimeUrl.hostname,'postgresql');
  assert.equal(config.SECRET_KEY,existing.SECRET_KEY);
  assert.equal(config.GOOGLE_CLIENT_CONFIG,existing.GOOGLE_CLIENT_CONFIG);
  for (const changed of [{...existing,SECRET_KEY:'unexpected'}, {...existing,DATABASE_URL:'postgresql://fixture:old@host/project_management'}, {...existing,DATABASE_URL:existing.DATABASE_URL+'?host=outside'}]) {
    assert.throws(() => buildFlightSecretEntries(input,changed), /^Error: FLIGHT_SECRET_REGISTRATION_INPUT_INVALID$/);
  }
});
