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
