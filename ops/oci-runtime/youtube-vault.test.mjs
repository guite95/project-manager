import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeMigrationArgs } from './migrate-youtube.mjs';
import { validateManifest } from './vault-secrets.mjs';
import { buildYoutubeSecretEntries } from './register-youtube-secrets.mjs';

test('YouTube migration is root-only, bounded, immutable and has no runtime secret mount',()=>{
  const args=youtubeMigrationArgs('ghcr.io/guite95/youtube-sync-backend:'+'a'.repeat(40),'youtube-migration-test');
  assert.ok(args.includes('--read-only'));assert.ok(args.includes('core=0'));assert.ok(args.includes('0:0'));
  assert.ok(args.includes('--vault-migrate'));assert.ok(!args.join(' ').includes('/youtube-backend'));
  assert.throws(()=>youtubeMigrationArgs('ghcr.io/guite95/youtube-sync-backend:latest','youtube-migration-test'));
});
test('YouTube profiles cannot request another service file or expose migration group',()=>{
  const m={service:'youtube-backend',gid:985,files:[{name:'CONFIG_JSON',secretId:'ocid1.vaultsecret.oc1.ap-chuncheon-1.abc',versionNumber:1}]};
  validateManifest(m);assert.throws(()=>validateManifest({...m,service:'youtube-migration'}));
  validateManifest({...m,service:'youtube-migration',gid:0});
  assert.throws(()=>validateManifest({...m,files:[{...m.files[0],name:'DATABASE_URL'}]}));
});
test('retained signing values are checked and media cannot receive DB credentials',()=>{
  const c={application_signing_secrets:{},service_accounts:{}};
  for(const n of ['youtube_jwt_access','youtube_jwt_refresh','youtube_media_shared'])c.application_signing_secrets[n]={new_secret:n.repeat(3)};
  for(const n of ['youtube_mysql_runtime','youtube_mysql_migration','youtube_backend_redis','youtube_media_redis'])c.service_accounts[n]={new_username:n,new_password:'synthetic-test-only'};
  const existing={backend:{JWT_ACCESS_SECRET:c.application_signing_secrets.youtube_jwt_access.new_secret,JWT_REFRESH_SECRET:c.application_signing_secrets.youtube_jwt_refresh.new_secret,MEDIA_TOKEN_SECRET:c.application_signing_secrets.youtube_media_shared.new_secret},media:{MEDIA_TOKEN_SECRET:c.application_signing_secrets.youtube_media_shared.new_secret},cookies:'synthetic cookie fixture'};
  const entries=buildYoutubeSecretEntries(c,existing),media=JSON.parse(entries[1].value),migration=JSON.parse(entries[2].value);
  assert.deepEqual(Object.keys(media).sort(),['MEDIA_TOKEN_SECRET','REDIS_PASSWORD','REDIS_USERNAME','YOUTUBE_COOKIES']);
  assert.deepEqual(Object.keys(migration).sort(),['DB_PASSWORD','DB_USER','RUNTIME_USER']);
  existing.backend.JWT_ACCESS_SECRET='drift';assert.throws(()=>buildYoutubeSecretEntries(c,existing));
});
