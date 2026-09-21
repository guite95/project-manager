import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
test('tunnel URL keeps credentials in memory, replaces the address and rejects another database',async()=>{
  const {tunnelDatabaseUrl}=await import('./shared-database.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
  assert.equal(typeof tunnelDatabaseUrl,'function');
  const url=new URL(tunnelDatabaseUrl('postgresql://app:p%40ss@postgresql:5432/project_management',15435));
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15435');assert.equal(url.password,'p%40ss');
  for(const source of ['postgresql://app@postgresql:5432/another','postgresql://app@postgresql:5432/project_management?host=other','http://server/project_management']) assert.throws(()=>tunnelDatabaseUrl(source,15435));
});

test('shared command refuses destructive commands before opening SSH',async()=>{
  for(const args of [['pnpm','test'],['pnpm','exec','prisma','migrate','dev'],['pnpm','exec','prisma','db','push']]) {
    const child=spawn(process.execPath,['scripts/with-shared-db.mjs','--',...args],{stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();
    const [code]=await once(child,'exit');
    assert.equal(code,1);assert.match(stderr,/공유 DB에서 테스트/);
  }
});

test('shared command refuses an occupied local port and preserves its listener',async()=>{
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
  try {
    const port=listener.address().port;
    const child=spawn(process.execPath,['scripts/with-shared-db.mjs','--','node','-e','process.exit(99)'],{env:{...process.env,SHARED_DB_LOCAL_PORT:String(port),SHARED_DB_SSH_HOST:'example.invalid',SHARED_DB_SSH_PORT:'22',SHARED_DB_SSH_USER:'test',SHARED_DB_SSH_KEY:'/unused'},stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();
    const [code]=await once(child,'exit');
    assert.equal(code,1);assert.match(stderr,/로컬 포트가 사용 중/);assert.equal(listener.listening,true);
  } finally {await new Promise(resolve=>listener.close(resolve));}
});

test('shared connection accepts the authenticated app identity, rejects mismatches and privileged roles',async()=>{
  const {isSharedDatabaseIdentity}=await import('./shared-database.ts');
  assert.equal(typeof isSharedDatabaseIdentity,'function');
  const source='postgresql://fixture_runtime:fixture@postgresql/project_management';
  const row={db:'project_management',role:'fixture_runtime',superuser:false,createRole:false,createDb:false,replication:false,bypassRls:false};
  assert.equal(isSharedDatabaseIdentity(source,row),true);
  for(const overrides of [{db:'other'},{role:'old_app'},...['superuser','createRole','createDb','replication','bypassRls'].map(key=>({[key]:true}))]) {
    assert.equal(isSharedDatabaseIdentity(source,{...row,...overrides}),false);
  }
});
