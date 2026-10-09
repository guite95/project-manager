import assert from 'node:assert/strict';
import {test} from 'node:test';
import {careerHttp,careerMetadata} from './career-http.ts';
test('MCP 기본 비활성: DB와 provider 연결 없이 endpoint와 discovery를 닫는다',async()=>{
  const before=process.env.CAREER_MCP_ENABLED;
  try {
    delete process.env.CAREER_MCP_ENABLED;
    const request=new Request('https://example.test/mcp/career',{method:'POST'});
    assert.equal((await careerHttp(request)).status,404);assert.equal(careerMetadata(request).status,404);
    process.env.CAREER_MCP_ENABLED='true';
    assert.equal((await careerHttp(request)).status,503);
  } finally {if(before===undefined)delete process.env.CAREER_MCP_ENABLED;else process.env.CAREER_MCP_ENABLED=before;}
});
test('initial OAuth challenge requests career read/write without granting paid evaluation scope',async()=>{
  const env={CAREER_MCP_ENABLED:'true',CAREER_OAUTH_ENABLED:'false',CAREER_OAUTH_ADDITIONAL_CLIENTS:'[]',CAREER_MCP_RESOURCE:'https://career.test/mcp/career',CAREER_MCP_ISSUER:'https://issuer.test',CAREER_MCP_JWKS_URL:'https://issuer.test/jwks',CAREER_MCP_SUBJECT:'test-subject',CAREER_MCP_OWNER_ID:'test-owner',CAREER_MCP_CLIENT_ID:'test-client'};
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  try{
    Object.assign(process.env,env);
    const response=await careerHttp(new Request(env.CAREER_MCP_RESOURCE,{method:'POST',headers:{host:'career.test'}}));
    assert.equal(response.status,401);
    const challenge=response.headers.get('WWW-Authenticate');
    assert.match(challenge,/scope="career:read career:write"/);
    assert.ok(!challenge.includes('career:evaluate'));
    assert.ok(challenge.includes('/.well-known/oauth-protected-resource/mcp/career'));
  }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
