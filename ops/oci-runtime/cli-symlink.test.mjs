import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('host entrypoints execute validation through the current release symlink instead of silently succeeding', t => {
  const dir=mkdtempSync(join(tmpdir(),'pm-cli-link-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  symlinkSync(resolve('ops/oci-runtime'),join(dir,'current'));
  for(const name of ['identity-readiness.mjs','vault-runtime.mjs','vault-readiness.mjs','provision-pm-roles.mjs','migrate-pm.mjs']) {
    const result=spawnSync(process.execPath,[join(dir,'current',name),'--invalid'],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,1,`${name} must reject invalid host invocation, not skip main`);
  }
});
