import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readOAuthConfig, oauthRouteKind, validateOAuthQuery} from './oauth-policy.ts';

const env={CAREER_OAUTH_ENABLED:'true',CAREER_MCP_RESOURCE:'https://project.dev-uk.shop/mcp/career',CAREER_MCP_OWNER_ID:'owner-test',CAREER_MCP_CLIENT_ID:'chatgpt-test',CAREER_OAUTH_REDIRECT_URI:'https://chatgpt.com/connector/oauth/test-callback'};
const secret='test-only-32-byte-secret-not-production-1234';
const config=()=>readOAuthConfig(env,secret);
const query=()=>new URLSearchParams({client_id:'chatgpt-test',redirect_uri:env.CAREER_OAUTH_REDIRECT_URI,response_type:'code',resource:env.CAREER_MCP_RESOURCE,scope:'career:read career:evaluate offline_access',state:'test-state',code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
const hermes={clientId:'career-hermes',name:'Hermes',redirectUri:'http://127.0.0.1:27890/callback'};
const additionalConfig=(clients=[hermes])=>readOAuthConfig({...env,CAREER_OAUTH_ADDITIONAL_CLIENTS:JSON.stringify(clients)},secret);
test('explicit public clients keep legacy ChatGPT settings and bind each exact callback',()=>{
  const cfg=additionalConfig();
  assert.equal(cfg.clientId,env.CAREER_MCP_CLIENT_ID);assert.equal(cfg.redirectUri,env.CAREER_OAUTH_REDIRECT_URI);
  assert.deepEqual(cfg.clients.map(c=>c.clientId),['chatgpt-test','career-hermes']);
  assert.equal(validateOAuthQuery(query(),cfg).get('client_id'),'chatgpt-test');
  const q=query();q.set('client_id',hermes.clientId);q.set('redirect_uri',hermes.redirectUri);
  assert.equal(validateOAuthQuery(q,cfg).get('client_id'),hermes.clientId);
  for(const [id,uri] of [[hermes.clientId,env.CAREER_OAUTH_REDIRECT_URI],['chatgpt-test',hermes.redirectUri],[hermes.clientId,'http://127.0.0.1:27891/callback'],[hermes.clientId,'http://localhost:27890/callback']]){
    const mixed=query();mixed.set('client_id',id);mixed.set('redirect_uri',uri);assert.throws(()=>validateOAuthQuery(mixed,cfg));
  }
  assert.throws(()=>validateOAuthQuery(q,config()),'removing the optional client immediately closes its authorization path');
});
test('additional client configuration fails closed on malformed, duplicate or unsafe registrations',()=>{
  for(const raw of ['', 'null','{}','[null]','not-json','['.repeat(17000)])assert.throws(()=>readOAuthConfig({...env,CAREER_OAUTH_ADDITIONAL_CLIENTS:raw},secret));
  for(const clients of [[hermes,hermes],[{...hermes,clientId:env.CAREER_MCP_CLIENT_ID}],[{...hermes,redirectUri:env.CAREER_OAUTH_REDIRECT_URI}],[hermes,{...hermes,clientId:'second'}],Array.from({length:9},(_,i)=>({...hermes,clientId:'client-'+i,redirectUri:`http://127.0.0.1:${27890+i}/callback`}))])assert.throws(()=>additionalConfig(clients));
  for(const patch of [{clientId:''},{clientId:'bad id'},{name:''},{name:'bad\nname'},{client_secret:'not-allowed'},{redirectUri:'http://remote.test:27890/callback'},{redirectUri:'http://localhost:27890/callback'},{redirectUri:'http://127.0.0.1/callback'},{redirectUri:'http://127.0.0.1:27890/other'},{redirectUri:'http://127.1:27890/callback'},{redirectUri:'https://*.example.test/callback'},{redirectUri:'https://user:pass@example.test/callback'},{redirectUri:'https://example.test/callback?q=1'},{redirectUri:'https://example.test/callback#fragment'},{redirectUri:'https://example.test:443/callback'},{redirectUri:'https://example.test/a/../callback'},{redirectUri:'https://example.test/callback\n'}])assert.throws(()=>additionalConfig([{...hermes,...patch}]),JSON.stringify(patch));
  assert.equal(additionalConfig([{...hermes,redirectUri:'https://approved.example.test/callback'}]).clients.length,2);
  assert.equal(additionalConfig([]).clients.length,1);
});
test('disabled OAuth does not require secrets; enabled rejects incomplete or unsafe settings',()=>{
  assert.equal(readOAuthConfig({},undefined),null);
  for(const key of Object.keys(env).filter(k=>k!=='CAREER_OAUTH_ENABLED'))assert.throws(()=>readOAuthConfig({...env,[key]:''},secret));
  assert.throws(()=>readOAuthConfig(env,'short'));
  for(const url of ['http://project.dev-uk.shop/mcp/career','https://u:p@project.dev-uk.shop/mcp/career','https://project.dev-uk.shop/mcp/career?x=1'])assert.throws(()=>readOAuthConfig({...env,CAREER_MCP_RESOURCE:url},secret));
  for(const uri of ['https://evil.test/cb','https://chatgpt.com.evil.test/connector/oauth/a','https://chatgpt.com/connector/oauth/test?x=1'])assert.throws(()=>readOAuthConfig({...env,CAREER_OAUTH_REDIRECT_URI:uri},secret));
});
test('OAuth grants bind exact client, callback, resource, scopes and S256 with no duplicate parameters',()=>{
  assert.equal(validateOAuthQuery(query(),config()).get('client_id'),'chatgpt-test');
  for(const [key,value] of [['client_id','other'],['redirect_uri','https://evil.test/cb'],['resource','https://evil.test'],['scope','career:read admin'],['scope','career:evaluate'],['code_challenge_method','plain'],['code_challenge','short'],['response_type','token']]){const q=query();q.set(key,value);assert.throws(()=>validateOAuthQuery(q,config()),key);}
  const dup=query();dup.append('client_id','other');assert.throws(()=>validateOAuthQuery(dup,config()));
  const extra=query();extra.set('request_uri','https://evil.test');assert.throws(()=>validateOAuthQuery(extra,config()));
});
test('ChatGPT locale hints are optional and preserve authorization bindings',()=>{
  for(const locale of ['ko','ko-KR','en-US','ko-KR en-US','zh-Hant-TW','en-US-u-hc-h12']){
    const q=query();q.set('ui_locales',locale);
    const original=q.toString();
    assert.equal(validateOAuthQuery(q,config()).get('ui_locales'),locale);
    assert.equal(q.toString(),original,'validation must not rewrite the browser-bound query');
  }
});
test('Hermes offline-access consent prompt preserves the exact browser-bound authorization request',()=>{
  const q=query();q.set('client_id',hermes.clientId);q.set('redirect_uri',hermes.redirectUri);
  q.set('scope','career:read career:write offline_access');q.set('prompt','consent');
  const original=q.toString();
  assert.equal(validateOAuthQuery(q,additionalConfig()).get('prompt'),'consent');
  assert.equal(q.toString(),original);
  for(const value of ['', 'none', 'login', 'select_account', 'consent login', ' consent', 'consent ', 'consent\n']){
    const invalid=new URLSearchParams(q);invalid.set('prompt',value);
    assert.throws(()=>validateOAuthQuery(invalid,additionalConfig()));
  }
  const duplicate=new URLSearchParams(q);duplicate.append('prompt','consent');
  assert.throws(()=>validateOAuthQuery(duplicate,additionalConfig()));
  for(const [key,value] of [['client_id','other'],['redirect_uri','https://evil.test/cb'],['resource','https://evil.test'],['scope','career:read admin'],['code_challenge_method','plain'],['request_uri','https://evil.test']]){
    const invalid=new URLSearchParams(q);invalid.set(key,value);
    assert.throws(()=>validateOAuthQuery(invalid,additionalConfig()),key);
  }
});
test('locale hints reject malformed, oversized and duplicate values',()=>{
  for(const locale of ['', ' ', 'ko_KR', 'ko--KR', '-ko', 'ko-', 'ko KR ', 'ko  en', 'ko\ten', 'ko\nen', 'ko\r', 'ko\u0000', '한국어', 'ko,<script>', 'a'.repeat(129), 'en-'+Array(15).fill('abcdefgh').join('-')]){
    const q=query();q.set('ui_locales',locale);
    assert.throws(()=>validateOAuthQuery(q,config()),locale);
  }
  const dup=query();dup.append('ui_locales','ko-KR');dup.append('ui_locales','en-US');
  assert.throws(()=>validateOAuthQuery(dup,config()));
});
test('locale hints never relax client, callback, resource, scope, PKCE or unknown parameter checks',()=>{
  for(const [key,value] of [['client_id','other'],['redirect_uri','https://evil.test/cb'],['resource','https://evil.test'],['scope','career:read admin'],['scope','career:evaluate'],['code_challenge_method','plain'],['code_challenge','short'],['response_type','token'],['request_uri','https://evil.test']]){
    const q=query();q.set('ui_locales','ko-KR');q.set(key,value);
    assert.throws(()=>validateOAuthQuery(q,config()),key);
  }
});
test('public route policy allows only exact OAuth operations, never registration or PM mutation routes',()=>{
  assert.equal(oauthRouteKind('/api/career-auth/oauth2/token','POST'),'server');
  assert.equal(oauthRouteKind('/api/career-auth/owner-bridge','POST'),'browser');
  assert.equal(oauthRouteKind('/api/career-auth/oauth2/authorize','GET'),'authorize');
  for(const [p,m]of [['/api/career-auth/sign-up/email','POST'],['/api/career-auth/oauth2/register','POST'],['/api/career-auth/oauth2/token/','POST'],['/api/career-auth/oauth2/token','GET'],['/api/login','POST'],['/api/career-auth/%6fauth2/token','POST']])assert.equal(oauthRouteKind(p,m),null);
});
