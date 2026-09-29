import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,cpSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
test('플러그인 패키지는 5개 스킬과 로컬 참조를 검증하고 비밀 파일을 거부한다',t=>{
  const run=root=>spawnSync(process.execPath,['scripts/package-career-plugin.mjs','--root',root,'--check'],{encoding:'utf8'});
  const result=run(resolve('plugins/career-application-toolkit'));assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).skills,5);
  const dir=mkdtempSync(join(tmpdir(),'career-plugin-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  cpSync('plugins/career-application-toolkit',join(dir,'plugin'),{recursive:true});writeFileSync(join(dir,'plugin','.env'),'fixture-key');
  assert.notEqual(run(join(dir,'plugin')).status,0);
});
