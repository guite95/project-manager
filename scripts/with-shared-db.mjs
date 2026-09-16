#!/usr/bin/env node
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createConnection, createServer} from 'node:net';
import {homedir} from 'node:os';
import {once} from 'node:events';
import {tunnelDatabaseUrl} from '../lib/shared-database.ts';

// Only connection metadata belongs in .env. The production URL is never written to disk.
try {process.loadEnvFile('.env');} catch(error) {if(error.code !== 'ENOENT') throw error;}
const run = promisify(execFile);
let tunnel, child, stopping = false;
function stopProcess(proc) {
  if(proc?.pid && proc.exitCode === null && proc.signalCode === null) {
    try {process.kill(-proc.pid,'SIGTERM');} catch { /* already stopped */ }
  }
}
function cleanup() {stopping=true;stopProcess(child);stopProcess(tunnel);}
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,cleanup);

function integer(value, fallback, minimum = 1) {
  const n=Number(value??fallback);
  if(!Number.isInteger(n)||n<minimum||n>65535) throw new Error('포트 범위가 올바르지 않습니다.');
  return n;
}
async function checkFreePort(port) {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  await new Promise(resolve=>server.close(resolve));
}
async function waitForTunnel(port) {
  const deadline=Date.now()+15000;
  while(Date.now()<deadline && !stopping) {
    if(tunnel.exitCode!==null||tunnel.signalCode!==null) throw new Error('SSH 터널을 열지 못했습니다.');
    const connected=await new Promise(resolve=>{
      const socket=createConnection({host:'127.0.0.1',port});
      socket.setTimeout(300);
      socket.once('connect',()=>{socket.destroy();resolve(true);});
      socket.once('error',()=>{socket.destroy();resolve(false);});
      socket.once('timeout',()=>{socket.destroy();resolve(false);});
    });
    if(connected) return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('SSH 터널 연결 시간이 초과되었습니다.');
}

try {
  const args=process.argv.slice(2);
  if(args[0]==='--') args.shift();
  if(!args.length) throw new Error('실행할 명령이 필요합니다: pnpm db:shared -- <command>');
  // Never generate/reset a schema or run destructive integration tests on the shared DB.
  if(args.some(a=>/^(test|db:reset-test|reset|db:migrate|--test)$/.test(a)) ||
     (args.includes('migrate')&&args.includes('dev')) || (args.includes('db')&&args.includes('push'))) {
    throw new Error('공유 DB에서 테스트·reset·migrate dev·db push는 실행할 수 없습니다.');
  }
  const host=process.env.SHARED_DB_SSH_HOST, user=process.env.SHARED_DB_SSH_USER;
  const key=process.env.SHARED_DB_SSH_KEY?.replace(/^~(?=\/)/,homedir());
  if(!host||!user||!key||!/^[a-zA-Z0-9.-]+$/.test(host)||!/^[a-zA-Z0-9_-]+$/.test(user)) {
    throw new Error('SHARED_DB_SSH_HOST/USER/KEY를 설정하세요. .env.example을 참고하세요.');
  }
  const port=integer(process.env.SHARED_DB_LOCAL_PORT,15435,1024);
  const sshPort=integer(process.env.SHARED_DB_SSH_PORT,61185);
  const remotePort=integer(process.env.SHARED_DB_REMOTE_PORT,15432);
  await checkFreePort(port);
  const sshArgs=['-i',key,'-p',String(sshPort),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3'];
  const target=`${user}@${host}`;
  tunnel=spawn('ssh',[...sshArgs,'-N','-L',`127.0.0.1:${port}:127.0.0.1:${remotePort}`,target],{stdio:['ignore','ignore','pipe'],detached:true});
  tunnel.on('error',cleanup);
  // Do not relay SSH stderr; surface a credential-free diagnostic below.
  tunnel.stderr.resume();
  await waitForTunnel(port);
  const {stdout}=await run('ssh',[...sshArgs,target,
    "docker exec project-management node -e 'process.stdout.write(process.env.DATABASE_URL || \"\")'"],{timeout:15000,maxBuffer:16384});
  const databaseUrl=tunnelDatabaseUrl(stdout.trim(),port);
  const {default:pg}=await import('pg');
  const probe=new pg.Client({connectionString:databaseUrl,connectionTimeoutMillis:5000});
  try {
    await probe.connect();
    const {rows}=await probe.query('SELECT current_database() AS db, current_user AS role');
    if(rows[0].db!=='project_management'||rows[0].role!=='project_management_app') throw new Error('공유 DB 또는 앱 계정이 예상과 다릅니다.');
  } finally {await probe.end();}
  if(stopping) throw new Error('실행이 중단되었습니다.');
  console.error(`[shared-db] 서버 project_management 연결 확인 · 로컬 포트 ${port}`);
  child=spawn(args[0],args.slice(1),{stdio:'inherit',detached:true,env:{...process.env,DATABASE_URL:databaseUrl,SHARED_DATABASE:'1',REQUIRE_LOGIN:'1'}});
  const childExit=once(child,'exit');
  tunnel.once('exit',()=>{if(!stopping){console.error('[shared-db] 터널이 종료되어 실행 중인 명령을 중단합니다.');stopProcess(child);}});
  const [code,signal]=await childExit;
  process.exitCode=code??(signal==='SIGINT'?130:1);
} catch(error) {
  // Underlying SSH/PG exceptions may contain connection details. Never dump the error object.
  console.error('[shared-db] 연결 또는 명령 실행에 실패했습니다. SSH 설정·개인키·포트 점유·서버 앱 상태를 확인하세요.');
  if(error.code==='EADDRINUSE') console.error('[shared-db] 로컬 포트가 사용 중입니다. 기존 연결을 종료하지 말고 SHARED_DB_LOCAL_PORT를 바꾸세요.');
  if(error.message?.startsWith('공유 DB에서')||error.message?.startsWith('SHARED_DB_')||error.message?.startsWith('실행할 명령')) console.error(error.message);
  process.exitCode=1;
} finally {cleanup();}
