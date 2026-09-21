import test from 'node:test';
import assert from 'node:assert/strict';
import { flightMigrationArgs } from './migrate-flight.mjs';
import { validateManifest } from './vault-secrets.mjs';

test('Flight migrations have only the root migration mount and an immutable image', () => {
  const args = flightMigrationArgs(`ghcr.io/adogs-flights/flight-backend:${'a'.repeat(40)}`, 'flight-migration-test');
  assert.equal(args.filter(x => x === '--mount').length, 1);
  assert(args.includes('--read-only'));
  assert(args.includes('core=0'));
  assert(args.includes('none'));
  assert(!args.some(x => x.startsWith('DATABASE_URL=')));
  assert(args.includes('FLIGHT_MIGRATION_SECRET_DIRECTORY=/run/oci-service-secrets/flight-migration'));
  assert.deepEqual(args.slice(-2), ['upgrade', 'head']);
  for (const image of ['ghcr.io/adogs-flights/flight-backend:latest', `other:${'a'.repeat(40)}`]) {
    assert.throws(() => flightMigrationArgs(image, 'flight-migration-test'));
  }
});
test('Flight profiles reject cross-service files and migration group exposure', () => {
  const file = { name:'CONFIG_JSON', secretId:'ocid1.vaultsecret.oc1.ap-chuncheon-1.abc', versionNumber:1 };
  assert.doesNotThrow(() => validateManifest({service:'flight',gid:900,files:[file]}));
  assert.throws(() => validateManifest({service:'flight',gid:900,files:[{...file,name:'DATABASE_URL'}]}));
  assert.doesNotThrow(() => validateManifest({service:'flight-migration',gid:0,files:[{...file,name:'DATABASE_URL'}]}));
  assert.throws(() => validateManifest({service:'flight-migration',gid:900,files:[{...file,name:'DATABASE_URL'}]}));
});
