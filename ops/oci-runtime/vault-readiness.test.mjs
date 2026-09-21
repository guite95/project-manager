import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('startup requires a complete protected runtime generation and refuses a migration-only generation', async t => {
  const { checkVaultReadiness } = await import('./vault-readiness.mjs').catch(e => { if(e.code==='ERR_MODULE_NOT_FOUND')return {}; throw e; });
  assert.equal(typeof checkVaultReadiness,'function');
  const dir=await mkdtemp(join(tmpdir(),'pm-vault-gate-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await chmod(dir,0o750); await mkdir(join(dir,'g-aaaaaa'),{mode:0o750});
  await symlink('g-aaaaaa',join(dir,'current'));
  await writeFile(join(dir,'g-aaaaaa/DATABASE_URL'),'postgresql://fixture:fixture@postgresql/project_management',{mode:0o640});
  const options={directory:dir,ownerUid:process.getuid()};
  assert.throws(()=>checkVaultReadiness(options),/VAULT_NOT_READY/);
  await writeFile(join(dir,'g-aaaaaa/SESSION_SECRET'),'fixture-session',{mode:0o640});
  assert.equal(checkVaultReadiness(options),true);
  await writeFile(join(dir,'g-aaaaaa/DATABASE_URL'),'postgresql://fixture:fixture@postgresql/other');
  assert.throws(()=>checkVaultReadiness(options),/VAULT_NOT_READY/);
});
