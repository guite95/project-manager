import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from './vault-secrets.mjs';

test('Ilchul publisher accepts isolated runtime and root-only migration profiles', () => {
  const files=[{name:'CONFIG_JSON',secretId:'ocid1.vaultsecret.oc1.ap-chuncheon-1.fixture',versionNumber:1}];
  for(const service of ['ilchul-backend','ilchul-migration','redis-admin']) {
    const gid=service==='ilchul-backend'?983:0;
    assert.doesNotThrow(()=>validateManifest({service,gid,files}));
    if(gid===0)assert.throws(()=>validateManifest({service,gid:983,files}));
  }
});
