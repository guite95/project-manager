import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIlchulSecretEntries } from './register-ilchul-secrets.mjs';

test('Ilchul registration preserves signing/API values and separates admin/migration secrets',()=>{
 const c={service_accounts:{},application_signing_secrets:{ilchul_jwt:{new_secret:'fixture-jwt'}},external_reissuance:{},infrastructure_admins:{redis:{new_username:'fixture-admin',new_password:'fixture-admin-pass'}}};
 for(const k of ['ilchul_mysql_runtime','ilchul_mysql_migration','ilchul_redis'])c.service_accounts[k]={new_username:k,new_password:'fixture-'+k};
 c.service_accounts.ilchul_minio={new_access_key:'fixture-minio',new_secret_key:'fixture-minio-pass'};
 const e={ADMIN_PASSWORD:'fixture-admin',JWT_SECRET_KEY:'fixture-jwt',KAKAO_REST_API_KEY:'fixture-rest'};
 for(const [k,n] of Object.entries({GOOGLE_API_KEY:'ilchul_google_api',TOUR_API_KEY:'ilchul_tour_api',ANTHROPIC_API_KEY:'ilchul_anthropic_api',OAUTH_GOOGLE_CLIENT_SECRET:'ilchul_google_oauth_client',OAUTH_KAKAO_CLIENT_SECRET:'ilchul_kakao_oauth_client',OAUTH_NAVER_CLIENT_SECRET:'ilchul_naver_oauth_client'})) {e[k]='fixture-'+n;c.external_reissuance[n]={new_secret:e[k]};}
 const entries=buildIlchulSecretEntries(c,e), runtime=JSON.parse(entries[0].value), migration=JSON.parse(entries[1].value);
 assert.equal(runtime.JWT_SECRET_KEY,'fixture-jwt');assert.equal(runtime.MYSQL_USER,'ilchul_mysql_runtime');
 assert.deepEqual(Object.keys(migration).sort(),['MYSQL_PASSWORD','MYSQL_USER']);
 assert.equal(migration.MYSQL_USER,'ilchul_mysql_migration');assert.equal(Object.keys(runtime).length,15);
 assert.equal(entries[2].name,'redis-host-admin-config');
 assert.throws(()=>buildIlchulSecretEntries(c,{...e,JWT_SECRET_KEY:'changed'}),/ILCHUL_SECRET_INPUT_INVALID/);
 assert.throws(()=>buildIlchulSecretEntries(c,{...e,ADMIN_PASSWORD:''}),/ILCHUL_SECRET_INPUT_INVALID/);
});
