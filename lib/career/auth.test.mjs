import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from 'jose';
const api=await import('./auth.ts').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const config={resource:'https://example.test/mcp/career',issuer:'https://auth.example.test/',jwks:'https://auth.example.test/jwks',subject:'owner-sub',ownerId:'owner',clientId:'chatgpt-client'};
test('설정 누락은 비활성 또는 fail-closed이고 임의 JWKS origin을 허용하지 않는다',()=>{
  assert.equal(typeof api.careerConfig,'function');assert.equal(api.careerConfig({}),null);
  assert.throws(()=>api.careerConfig({CAREER_MCP_ENABLED:'true'}));
  const env={CAREER_MCP_ENABLED:'true',CAREER_MCP_RESOURCE:config.resource,CAREER_MCP_ISSUER:config.issuer,CAREER_MCP_JWKS_URL:config.jwks,CAREER_MCP_SUBJECT:config.subject,CAREER_MCP_OWNER_ID:config.ownerId,CAREER_MCP_CLIENT_ID:config.clientId};
  assert.deepEqual(api.careerConfig(env),config);assert.throws(()=>api.careerConfig({...env,CAREER_MCP_JWKS_URL:'https://evil.test/jwks'}));
});
test('MCP 예외는 정확한 경로와 메서드만 열고 기존 API에는 적용하지 않는다',()=>{
  assert.equal(typeof api.isCareerRoute,'function');
  assert.equal(api.isCareerRoute('/mcp/career','POST'),true);
  for(const path of ['/mcp/career/admin','/mcp/%63areer','/api/portfolio/credentials','/.well-known/other'])assert.equal(api.isCareerRoute(path,'POST'),false);
  assert.equal(api.isCareerRoute('/.well-known/oauth-protected-resource/mcp/career','POST'),false);
});
test('JWT 서명·대상·만료·scope·등록된 subject와 현재 DB OWNER를 모두 확인한다',async()=>{
  assert.equal(typeof api.authorizeCareer,'function');
  const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);const keySet=createLocalJWKSet({keys:[{...jwk,kid:'test'}]});
  async function token(patch={}){return new SignJWT({scope:'career:read career:evaluate',client_id:'chatgpt-client',...patch}).setProtectedHeader({alg:'RS256',kid:'test',typ:'at+jwt'}).setIssuer(config.issuer).setAudience(patch.aud??config.resource).setSubject(patch.sub??config.subject).setIssuedAt().setExpirationTime(patch.exp??'5m').sign(privateKey);}
  const request=t=>new Request(config.resource,{method:'POST',headers:{Host:'example.test',Authorization:`Bearer ${t}`}});
  const lookup=async()=>({id:'owner',role:'OWNER',active:true});
  const actor=await api.authorizeCareer(request(await token()),config,keySet,lookup);assert.equal(actor.ownerId,'owner');assert.ok(actor.scopes.includes('career:evaluate'));
  for(const patch of [{aud:'other'},{sub:'other'},{scope:''},{client_id:'other'},{exp:1}])await assert.rejects(api.authorizeCareer(request(await token(patch)),config,keySet,lookup));
  await assert.rejects(api.authorizeCareer(request(await token()),config,keySet,async()=>({id:'owner',role:'ADMIN',active:true})));
  await assert.rejects(api.authorizeCareer(request(await token()),config,keySet,async()=>({id:'owner',role:'OWNER',active:false})));
  const evil=new Request(config.resource,{headers:{Host:'example.test',Origin:'https://evil.test',Authorization:`Bearer ${await token()}`}});
  await assert.rejects(api.authorizeCareer(evil,config,keySet,lookup));
});
