import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('host provisioning CLI rejects unsupported modes and never echoes supplied credentials', () => {
  const r=spawnSync(process.execPath,['ops/oci-runtime/provision-pm-roles.mjs','--unknown'],{input:'{"password":"fixture-must-not-echo"}',encoding:'utf8',timeout:3000});
  assert.equal(r.status,1);
  assert.equal(r.stdout.trim(),'PM_ROLE_PROVISION_FAILED');
  assert.equal(r.stderr.includes('fixture-must-not-echo'),false);
});
