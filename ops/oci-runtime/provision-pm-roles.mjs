import { spawnSync } from 'node:child_process';
import { lstat, open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { provisionPmRoles } from './pg-roles.mjs';

function docker(args) {
  const result = spawnSync('/usr/bin/docker', args, { encoding:'utf8',timeout:30000,maxBuffer:1024*1024 });
  if (result.status !== 0) throw new Error();
  return result.stdout;
}
async function main() {
  const mode=process.argv[2];
  if(process.getuid()!==0 || process.argv.length!==3 || !['--check','--apply'].includes(mode)) throw new Error();
  const chunks=[];let length=0;
  for await(const chunk of process.stdin) {length+=chunk.length;if(length>16384)throw new Error();chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);let input;
  try {input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} finally {bytes.fill(0);for(const chunk of chunks)chunk.fill(0);}
  if(Object.keys(input).sort().join(',')!=='migration,runtime')throw new Error();
  for(const item of [input.runtime,input.migration]) {
    if(!item || Object.keys(item).sort().join(',')!=='password,username' || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(item.username??'')
      || typeof item.password!=='string' || item.password.length<12 || item.password.length>32 || !/^[\x21-\x7e]+$/.test(item.password)) throw new Error();
  }
  const container=JSON.parse(docker(['inspect','postgresql']))[0];
  const env=Object.fromEntries(container.Config.Env.filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
  const bindings=container.HostConfig.PortBindings['5432/tcp'];
  if(!bindings?.some(b=>b.HostIp==='127.0.0.1'&&b.HostPort==='15432') || !env.POSTGRES_USER || !env.POSTGRES_PASSWORD)throw new Error();
  const connection={host:'127.0.0.1',port:15432,database:'project_management',user:env.POSTGRES_USER,password:env.POSTGRES_PASSWORD,connectionTimeoutMillis:5000};
  const admin=new pg.Client(connection);let backup;
  try {
    await admin.connect();
    const {rows:[preflight]}=await admin.query(`SELECT current_database()='project_management' AS database_ok,
      (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS admin_ok,
      (SELECT count(*)::int FROM pg_roles WHERE lower(rolname) IN (lower($1),lower($2))) AS collisions,
      (SELECT NOT r.rolsuper FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database()) AS owner_ok`,[input.runtime.username,input.migration.username]);
    if(!preflight.database_ok || !preflight.admin_ok || !preflight.owner_ok || preflight.collisions!==0)throw new Error();
    if(mode==='--check'){console.log(JSON.stringify({ok:true,available:2,applied:false}));return;}
    const directory='/var/backups/oci-vault-migration',stat=await lstat(directory);
    if(!stat.isDirectory() || stat.uid!==0 || (stat.mode&0o777)!==0o700)throw new Error();
    const dump=docker(['exec','postgresql','sh','-c','export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dumpall -U "$POSTGRES_USER" --roles-only']);
    if(!dump.includes('PostgreSQL database cluster dump')||!dump.includes('CREATE ROLE '))throw new Error();
    backup=`${directory}/pm-roles-before-${new Date().toISOString().replace(/[^0-9TZ]/g,'')}.sql`;
    const file=await open(backup,'wx',0o600);
    try {await file.writeFile(dump);await file.sync();}finally{await file.close();}
    const result=await provisionPmRoles(admin,{...input,expectedDatabase:'project_management'});
    for(const kind of ['runtime','migration']) {
      const account=input[kind];
      const client=new pg.Client({...connection,user:account.username,password:account.password});
      try {
        await client.connect();
        const {rows:[role]}=await client.query(`SELECT current_user=$1 AS identity_ok,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
          has_schema_privilege(current_user,'public','CREATE') AS ddl FROM pg_roles WHERE rolname=current_user`,[account.username]);
        if(!role.identity_ok || [role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolreplication,role.rolbypassrls].some(Boolean)
          || role.ddl!==(kind==='migration'))throw new Error();
        await client.query('SELECT id FROM public.access_user LIMIT 0');
        await client.query('SELECT id FROM public.ai_ops_session LIMIT 0');
      } finally {await client.end();}
    }
    console.log(JSON.stringify({ok:true,...result,connectionsVerified:2,backup,appCredentialChanged:false}));
  } finally {await admin.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{process.stdout.write('PM_ROLE_PROVISION_FAILED\n');process.exitCode=1;});
}
