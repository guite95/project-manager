import { lstat, readlink, open, statfs, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isMainModule } from '../../lib/server/cli-entry.mjs';

export async function readServiceFile(service, name) {
  const profiles={'flight':['CONFIG_JSON'],'flight-migration':['DATABASE_URL'],'youtube-backend':['CONFIG_JSON'],'youtube-media':['CONFIG_JSON'],'youtube-migration':['CONFIG_JSON']};
  if (!Object.hasOwn(profiles,service) || !profiles[service].includes(name)) throw new Error('SERVICE_SECRET_NOT_READY');
  const directory=`/run/oci-service-secrets/${service}`;
  const parent=await lstat(directory), link=await lstat(`${directory}/current`), target=await readlink(`${directory}/current`);
  if(!parent.isDirectory()||parent.uid!==0||(parent.mode&0o777)!==0o750||!link.isSymbolicLink()||link.uid!==0||!/^g-[A-Za-z0-9]{6}$/.test(target))throw new Error('SERVICE_SECRET_NOT_READY');
  const generation=await lstat(`${directory}/${target}`);
  if(!generation.isDirectory()||generation.uid!==0||generation.gid!==parent.gid||(generation.mode&0o777)!==0o750)throw new Error('SERVICE_SECRET_NOT_READY');
  const file=await open(`${directory}/${target}/${name}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const s=await file.stat();if(!s.isFile()||s.uid!==0||s.gid!==parent.gid||(s.mode&0o777)!==0o640||s.nlink!==1||s.size<1||s.size>65536)throw new Error();
    const bytes=Buffer.alloc(65537);try{const {bytesRead}=await file.read(bytes,0,bytes.length,0);if(bytesRead!==s.size||bytes.subarray(0,bytesRead).includes(0))throw new Error();return new TextDecoder('utf8',{fatal:true}).decode(bytes.subarray(0,bytesRead));}finally{bytes.fill(0);}
  }finally{await file.close();}
}

export async function checkServiceReadiness(service) {
  if(process.getuid()!==0||(await statfs('/run')).type!==0x01021994||(await readFile('/proc/swaps','utf8')).trim().split('\n').length!==1)throw new Error();
  if(['youtube-backend','youtube-media'].includes(service)){
    const values=JSON.parse(await readServiceFile(service,'CONFIG_JSON'));
    const names=service==='youtube-backend'?['DB_USER','DB_PASSWORD','REDIS_USERNAME','REDIS_PASSWORD','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','MEDIA_TOKEN_SECRET']:['REDIS_USERNAME','REDIS_PASSWORD','MEDIA_TOKEN_SECRET','YOUTUBE_COOKIES'];
    if(Object.keys(values).sort().join(',')!==names.sort().join(',')||!names.every(n=>typeof values[n]==='string'&&(n==='YOUTUBE_COOKIES'||values[n].length>0)))throw new Error();
    return;
  }
  if(service!=='flight')throw new Error();
  const values=JSON.parse(await readServiceFile(service,'CONFIG_JSON'));
  const names=['DATABASE_URL','SECRET_KEY','SMTP_PASSWORD','KAKAO_CLIENT_SECRET','KAKAO_REST_API_KEY','GOOGLE_CLIENT_CONFIG'];
  if(Object.keys(values).sort().join(',')!==names.sort().join(',')||!names.every(n=>typeof values[n]==='string')||!values.SECRET_KEY)throw new Error();
  const url=new URL(values.DATABASE_URL);if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.pathname)!=='/flight-db'||!url.username||!url.password)throw new Error();
}
if(isMainModule(import.meta.url))checkServiceReadiness(process.argv.length===3?process.argv[2]:null).catch(()=>{process.stderr.write('SERVICE_SECRET_NOT_READY\n');process.exitCode=1;});
