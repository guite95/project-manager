export const OAUTH_SCOPES=['career:read','career:evaluate','career:write','offline_access'];
export const AUTH_PATH='/api/career-auth';
export type OAuthConfig={resource:string;origin:string;issuer:string;ownerId:string;clientId:string;redirectUri:string;secret:string};
export function readOAuthConfig(env:NodeJS.ProcessEnv=process.env,secret?:string):OAuthConfig|null {
  if(env.CAREER_OAUTH_ENABLED!=='true')return null;
  const resource=env.CAREER_MCP_RESOURCE,ownerId=env.CAREER_MCP_OWNER_ID,clientId=env.CAREER_MCP_CLIENT_ID,redirectUri=env.CAREER_OAUTH_REDIRECT_URI;
  if(!resource||!ownerId||!clientId||!redirectUri||!secret||secret.length<32)throw new Error('OAUTH_NOT_CONFIGURED');
  const url=new URL(resource),callback=new URL(redirectUri);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.pathname!=='/mcp/career'||callback.protocol!=='https:'||callback.hostname!=='chatgpt.com'||callback.port||callback.username||callback.password||callback.hash||callback.search||!callback.pathname.startsWith('/connector/oauth/'))throw new Error('OAUTH_NOT_CONFIGURED');
  return {resource,origin:url.origin,issuer:url.origin+AUTH_PATH,ownerId,clientId,redirectUri,secret};
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
  if(!config||[...query.keys()].some(k=>!allowed.includes(k)||query.getAll(k).length!==1)||query.toString().length>2500||query.get('client_id')!==config.clientId||query.get('redirect_uri')!==config.redirectUri||query.get('resource')!==config.resource||query.get('response_type')!=='code'||query.get('code_challenge_method')!=='S256'||!/^[-_A-Za-z0-9]{43}$/.test(query.get('code_challenge')??'')||!query.get('state')||query.get('state')!.length>512)throw new Error('OAUTH_INVALID_REQUEST');
  // Locale hints never affect identity or grants; preserve the exact browser-bound query.
  const locales=query.get('ui_locales');
  if(locales!==null&&(locales.length>128||locales.trim()!==locales||!/^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*(?: [A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*)*$/.test(locales)))throw new Error('OAUTH_INVALID_REQUEST');
  const scopes=(query.get('scope')??'').split(' ');
  if(!scopes.includes('career:read')||scopes.some(s=>!OAUTH_SCOPES.includes(s))||new Set(scopes).size!==scopes.length)throw new Error('OAUTH_INVALID_SCOPE');
  return query;
}
