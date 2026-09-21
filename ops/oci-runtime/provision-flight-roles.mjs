import { spawnSync } from 'node:child_process';
import { lstat, open } from 'node:fs/promises';
import { isMainModule } from '../../lib/server/cli-entry.mjs';
import pg from 'pg';
import { provisionFlightRoles } from './flight-roles.mjs';

function run(command, args, timeout=30000) {
  const result=spawnSync(command,args,{encoding:'utf8',timeout,maxBuffer:1024*1024});
  if(result.status!==0)throw new Error();
  return result.stdout;
}
async function main() {
  const mode=process.argv[2];
  if(process.getuid()!==0||process.argv.length!==3||!['--check','--apply'].includes(mode))throw new Error();
  const chunks=[];let length=0;
  for await(const chunk of process.stdin){length+=chunk.length;if(length>16384)throw new Error();chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);let input;
  try{input=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}finally{bytes.fill(0);for(const c of chunks)c.fill(0);}
  if(Object.keys(input).sort().join(',')!=='migration,runtime')throw new Error();
  for(const item of [input.runtime,input.migration])if(!item||Object.keys(item).sort().join(',')!=='password,username'||!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(item.username??'')||typeof item.password!=='string'||item.password.length<12||item.password.length>32||!/^[\x21-\x7e]+$/.test(item.password))throw new Error();
  const container=JSON.parse(run('/usr/bin/docker',['inspect','postgresql']))[0];
  const env=Object.fromEntries(container.Config.Env.map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
  if(!container.HostConfig.PortBindings['5432/tcp']?.some(b=>b.HostIp==='127.0.0.1'&&b.HostPort==='15432'))throw new Error();
  const connection={host:'127.0.0.1',port:15432,database:'flight-db',user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,connectionTimeoutMillis:5000};
  const admin=new pg.Client(connection);
  try{
    await admin.connect();
    const {rows:[check]}=await admin.query(`SELECT current_database()='flight-db' AS database_ok,
      (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS admin_ok,
      (SELECT count(*)::int FROM pg_roles WHERE lower(rolname) IN (lower($1),lower($2))) AS collisions`,[input.runtime.username,input.migration.username]);
    if(!check.database_ok||!check.admin_ok||check.collisions!==0)throw new Error();
    if(mode==='--check'){console.log(JSON.stringify({ok:true,available:2,applied:false}));return;}
    run('/bin/bash',['/opt/project-management-runtime/current/ops/oci-runtime/backup-flight-db.sh'],210000);
    const directory='/var/backups/oci-vault-migration',info=await lstat(directory);
    if(!info.isDirectory()||info.uid!==0||(info.mode&0o777)!==0o700)throw new Error();
    const dump=run('/usr/bin/docker',['exec','postgresql','sh','-c','export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dumpall -U "$POSTGRES_USER" --roles-only']);
    if(!dump.includes('PostgreSQL database cluster dump'))throw new Error();
    const backup=`${directory}/flight-roles-before-${new Date().toISOString().replace(/[^0-9TZ]/g,'')}.sql`;
    const f=await open(backup,'wx',0o600);try{await f.writeFile(dump);await f.sync();}finally{await f.close();}
    const result=await provisionFlightRoles(admin,input);
    for(const kind of ['runtime','migration']){
      const account=input[kind],client=new pg.Client({...connection,user:account.username,password:account.password});
      try{
        await client.connect();
        const {rows:[role]}=await client.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
          has_schema_privilege(current_user,'public','CREATE') AS ddl FROM pg_roles WHERE rolname=current_user`);
        if([role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolreplication,role.rolbypassrls].some(Boolean)||role.ddl!==(kind==='migration'))throw new Error();
        await client.query('SELECT version_num FROM public.alembic_version');
        await client.query('SELECT id FROM public.users LIMIT 0');
      }finally{await client.end();}
    }
    console.log(JSON.stringify({ok:true,...result,connectionsVerified:2,backup,appCredentialChanged:false}));
  }finally{await admin.end();}
}
if(isMainModule(import.meta.url))main().catch(()=>{process.stdout.write('FLIGHT_ROLE_PROVISION_FAILED\n');process.exitCode=1;});
