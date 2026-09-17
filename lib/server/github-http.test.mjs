import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../session.ts';
import { githubJson, requireGitHubSession, readGitHubCredentialBody } from './github-http.ts';

test('토큰 본문 크기와 형식을 제한하며 파싱 오류에 원문을 노출하지 않는다',async()=>{
  const request=body=>new Request('http://localhost/api/github/credentials',{method:'POST',headers:{'content-type':'application/json'},body});
  await assert.rejects(readGitHubCredentialBody(request('SECRET_INVALID_JSON')),error=>!error.message.includes('SECRET_INVALID_JSON'));
  await assert.rejects(readGitHubCredentialBody(request(JSON.stringify({token:'x'.repeat(5000)}))),error=>error.status===413);
  assert.deepEqual(await readGitHubCredentialBody(request(JSON.stringify({label:'조직',token:'example'}))),{label:'조직',token:'example'});
});

test('개발 모드에서도 GitHub API는 로그인 없이 실행하지 않는다', async()=>{
  let called=false;
  const response=await githubJson(new Request('http://localhost/api/github/status'),async()=>{called=true;return {};});
  assert.equal(response.status,401);
  assert.equal(called,false);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('유효한 세션이어도 외부 출처의 쓰기를 차단한다',async()=>{
  const previous=process.env.SESSION_SECRET;
  process.env.SESSION_SECRET='test-session-secret';
  try {
    const session=await createSessionToken(process.env.SESSION_SECRET,Date.now()+60000);
    const request=origin=>new Request('http://localhost/api/personal-projects/personal-ilchul/github',{method:'PUT',headers:{cookie:`pm_session=${session}`,origin}});
    await assert.rejects(requireGitHubSession(request('https://evil.example'),true),error=>error.status===403);
    assert.equal(await requireGitHubSession(request('http://localhost'),true),session);
  } finally {if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;}
});

test('예외 원문에 비밀값이 있어도 응답에 포함하지 않는다',async()=>{
  const previous=process.env.SESSION_SECRET;
  process.env.SESSION_SECRET='test-session-secret';
  try {
    const session=await createSessionToken(process.env.SESSION_SECRET,Date.now()+60000);
    const response=await githubJson(new Request('http://localhost/api/github/status',{headers:{cookie:`pm_session=${session}`}}),async()=>{throw new Error('SECRET_MUST_NOT_LEAK');});
    assert.equal(response.status,500);
    assert.equal((await response.text()).includes('SECRET_MUST_NOT_LEAK'),false);
  } finally {if(previous===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previous;}
});
