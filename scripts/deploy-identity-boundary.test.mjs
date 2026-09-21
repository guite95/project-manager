import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deployment rejects mutable, missing and shell-like image references before host access', () => {
  for (const image of ['', 'project-management:latest', 'arbitrary:1234', 'project-management:$(id)']) {
    const result = spawnSync('bash', ['scripts/deploy-identity-boundary.sh', image], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(result.stderr.trim(), 'IMMUTABLE_PM_IMAGE_REQUIRED');
    assert.equal(result.stdout, '');
  }
});

test('failed host migration stops deployment before the running application is stopped or replaced', t => {
  const dir=mkdtempSync(join(tmpdir(),'pm-deploy-order-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const mounts=['/run/project-management-broker','/run/project-management-google','/run/oci-service-secrets/project-management']
    .map(path=>({type:'bind',source:path,target:path,read_only:true}));
  writeFileSync(join(dir,'compose.json'),JSON.stringify({services:{app:{volumes:mounts,group_add:['987'],restart:'no',command:['node','server.js'],environment:{
    OCI_STORAGE_AUTH:'broker',GOOGLE_APPLICATION_CREDENTIALS:'',
    GOOGLE_ACCESS_TOKEN_FILE:'/run/project-management-google/access-token.json',PM_SECRET_DIRECTORY:'/run/oci-service-secrets/project-management',
  }}}}));
  const executable=`#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const command=path.basename(process.argv[1]),args=process.argv.slice(2),dir=process.env.PM_FIXTURE_DIR;
fs.appendFileSync(path.join(dir,'calls'),JSON.stringify([command,...args])+'\\n');
if(command==='getent')process.stdout.write('pm-runtime:x:987:\\n');
else if(command==='sudo'){
  if(args.includes('--mode'))process.stdout.write('vault\\n');
  else if(args.some(a=>a.endsWith('/migrate-pm.mjs')))process.exit(1);
  else if(!['restart','start','reload'].some(a=>args.includes(a))&&!args.some(a=>a.endsWith('/vault-readiness.mjs')||a.endsWith('/identity-readiness.mjs')))process.exit(9);
}else if(command==='docker'){
  if(args.join(' ')==='compose config --format json')process.stdout.write(fs.readFileSync(path.join(dir,'compose.json')));
  else process.exit(9);
}else if(command!=='flock')process.exit(9);
`;
  for(const command of ['sudo','docker','getent','flock'])writeFileSync(join(dir,command),executable,{mode:0o700});
  // Only redirect the checkout cwd into an isolated fixture. The deployed script's
  // commands, validation and control flow execute unchanged against process doubles.
  const script=readFileSync('scripts/deploy-identity-boundary.sh','utf8').replace('cd /home/ubuntu/project-management',`cd '${dir}'`);
  const result=spawnSync('bash',['-c',script,'deployment-test',`project-management:${'a'.repeat(40)}`],{
    encoding:'utf8',env:{...process.env,PATH:`${dir}:${process.env.PATH}`,PM_FIXTURE_DIR:dir},
  });
  assert.equal(result.status,1,result.stderr);
  const calls=readFileSync(join(dir,'calls'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(args=>args.some(a=>a.endsWith('/migrate-pm.mjs'))).length,1);
  assert.equal(calls.some(args=>args.includes('stop')||args.includes('up')),false);
  // Restarting a Requires= dependency can stop the current app before migration.
  assert.deepEqual(calls.filter(args=>args.includes('project-management-secrets.service'))
    .map(args=>args.find(a=>['restart','start','reload'].includes(a))),['start','reload']);
});
