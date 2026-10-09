export const OAUTH_SCOPES=['career:read','career:evaluate','career:write','offline_access'];
export const AUTH_PATH='/api/career-auth';
export type OAuthClient={clientId:string;name:string;redirectUri:string};
export type OAuthConfig={resource:string;origin:string;issuer:string;ownerId:string;clientId:string;redirectUri:string;clients:OAuthClient[];secret:string};
function invalidConfig():never{throw new Error('OAUTH_NOT_CONFIGURED');}
export function readOAuthClients(env:NodeJS.ProcessEnv):OAuthClient[] {
  const clientId=env.CAREER_MCP_CLIENT_ID,redirectUri=env.CAREER_OAUTH_REDIRECT_URI;
  if(!clientId||!redirectUri)invalidConfig();
  let callback:URL;try{callback=new URL(redirectUri);}catch{return invalidConfig();}
  if(callback.protocol!=='https:'||callback.hostname!=='chatgpt.com'||callback.port||callback.username||callback.password||callback.hash||callback.search||!callback.pathname.startsWith('/connector/oauth/'))invalidConfig();
  const clients:OAuthClient[]=[{clientId,name:'ChatGPT',redirectUri}];
  const raw=env.CAREER_OAUTH_ADDITIONAL_CLIENTS;
  if(raw===undefined)return clients;
  if(raw.length>16384)invalidConfig();
  let additions:unknown;try{additions=JSON.parse(raw);}catch{return invalidConfig();}
  if(!Array.isArray(additions)||additions.length>8)invalidConfig();
  const ids=new Set([clientId]),callbacks=new Set([callback.href]);
  for(const entry of additions){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['clientId','name','redirectUri'].includes(k)))invalidConfig();
    const {clientId:id,name,redirectUri:uri}=entry;
    if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)||typeof name!=='string'||!name||name.length>80||name.trim()!==name||/[\u0000-\u001f\u007f]/.test(name)||typeof uri!=='string'||uri.length>2048)invalidConfig();
    let url:URL;try{url=new URL(uri);}catch{return invalidConfig();}
    // Public native clients get a fixed literal loopback callback, never a port wildcard.
    const loopback=url.protocol==='http:'&&url.hostname==='127.0.0.1'&&Number(url.port)>=1024&&Number(url.port)<=65535&&url.pathname==='/callback';
    if((url.protocol!=='https:'&&!loopback)||url.href!==uri||url.username||url.password||url.search||url.hash||/\*|%2a/i.test(uri)||ids.has(id)||callbacks.has(url.href))invalidConfig();
    ids.add(id);callbacks.add(url.href);clients.push({clientId:id,name,redirectUri:uri});
  }
  return clients;
}
export const findOAuthClient=(config:OAuthConfig,clientId:string|null)=>config.clients.find(client=>client.clientId===clientId);
export function readOAuthConfig(env:NodeJS.ProcessEnv=process.env,secret?:string):OAuthConfig|null {
  if(env.CAREER_OAUTH_ENABLED!=='true')return null;
  const resource=env.CAREER_MCP_RESOURCE,ownerId=env.CAREER_MCP_OWNER_ID,clientId=env.CAREER_MCP_CLIENT_ID,redirectUri=env.CAREER_OAUTH_REDIRECT_URI;
  if(!resource||!ownerId||!clientId||!redirectUri||!secret||secret.length<32)throw new Error('OAUTH_NOT_CONFIGURED');
  const url=new URL(resource),clients=readOAuthClients(env);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.pathname!=='/mcp/career')throw new Error('OAUTH_NOT_CONFIGURED');
  return {resource,origin:url.origin,issuer:url.origin+AUTH_PATH,ownerId,clientId,redirectUri,clients,secret};
}
export function oauthRouteKind(path:string,method:string):'server'|'browser'|'authorize'|'metadata'|null {
  if(method==='GET'&&path===AUTH_PATH+'/oauth2/authorize')return 'authorize';
  if(method==='GET'&&[AUTH_PATH+'/jwks',AUTH_PATH+'/.well-known/oauth-authorization-server','/.well-known/oauth-authorization-server'+AUTH_PATH].includes(path))return 'metadata';
  if(method==='POST'&&[AUTH_PATH+'/oauth2/token',AUTH_PATH+'/oauth2/revoke'].includes(path))return 'server';
  if(method==='POST'&&[AUTH_PATH+'/owner-bridge',AUTH_PATH+'/oauth2/consent',AUTH_PATH+'/disconnect'].includes(path))return 'browser';
  return null;
}
export function validateOAuthQuery(query:URLSearchParams,config:OAuthConfig|null):URLSearchParams {
  const allowed=['client_id','redirect_uri','response_type','resource','scope','state','code_challenge','code_challenge_method','ui_locales'];
  const client=config?findOAuthClient(config,query.get('client_id')):undefined;
  if(!config||!client||[...query.keys()].some(k=>!allowed.includes(k)||query.getAll(k).length!==1)||query.toString().length>2500||query.get('redirect_uri')!==client.redirectUri||query.get('resource')!==config.resource||query.get('response_type')!=='code'||query.get('code_challenge_method')!=='S256'||!/^[-_A-Za-z0-9]{43}$/.test(query.get('code_challenge')??'')||!query.get('state')||query.get('state')!.length>512)throw new Error('OAUTH_INVALID_REQUEST');
  // Locale hints never affect identity or grants; preserve the exact browser-bound query.
  const locales=query.get('ui_locales');
  if(locales!==null&&(locales.length>128||locales.trim()!==locales||!/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*(?: [A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*)*$/.test(locales)))throw new Error('OAUTH_INVALID_REQUEST');
  const scopes=(query.get('scope')??'').split(' ');
  if(!scopes.includes('career:read')||scopes.some(s=>!OAUTH_SCOPES.includes(s))||new Set(scopes).size!==scopes.length)throw new Error('OAUTH_INVALID_SCOPE');
  return query;
}
