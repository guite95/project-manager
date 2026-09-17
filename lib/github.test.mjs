import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGitHubRepositoryUrl, validateGitHubCredential } from './github.ts';
import { verifyGitHubRepository } from './server/github-api.ts';

test('GitHub 저장소 URL만 허용하고 clone 주소를 정규화한다', () => {
  assert.deepEqual(parseGitHubRepositoryUrl(' https://github.com/Owner/repo.git/ '), {owner:'Owner',repo:'repo',url:'https://github.com/Owner/repo'});
  for (const url of ['https://example.com/a/b', 'https://github.com.evil.test/a/b', 'http://github.com/a/b', 'https://user:secret@github.com/a/b', 'https://github.com/a/b/tree/main', 'https://github.com/a/b?token=x', 'https://github.com/a/%2e%2e', 'https://github.com/a/b#fragment', 'https://github.com/a/b\\c']) {
    assert.throws(()=>parseGitHubRepositoryUrl(url));
  }
});

const repo = {id:42,full_name:'team/project',private:true,default_branch:'main'};
const ok = data => new Response(JSON.stringify(data), {status:200,headers:{'Content-Type':'application/json'}});
test('공개 조회가 성공해도 소유·참여 목록에 없는 저장소는 거부한다', async () => {
  await assert.rejects(verifyGitHubRepository('https://github.com/team/project', 'test-token', async url =>
    ok(String(url).includes('/user/repos?') ? [] : {...repo,private:false})), /소유하거나 참여/);
});

test('두 번째 페이지의 참여 저장소도 확인하고 서버 메타데이터만 반환한다', async () => {
  const requests=[];
  const result=await verifyGitHubRepository('https://github.com/TEAM/project.git', 'test-token', async (url,init) => {
    requests.push(String(url));
    assert.equal(init.redirect,'error');
    if (!String(url).includes('/user/repos?')) return ok({...repo,untrusted:'discard'});
    const page=new URL(url).searchParams.get('page');
    return ok(page==='1' ? Array.from({length:100},(_,i)=>({id:1000+i})) : [repo]);
  });
  assert.equal(requests.length,3);
  assert.deepEqual(result,{id:42,fullName:'team/project',url:'https://github.com/team/project',private:true,defaultBranch:'main'});
});

test('인증 실패는 원문·토큰을 노출하지 않고 재연결을 안내한다',async()=>{
  await assert.rejects(verifyGitHubRepository('https://github.com/team/project','test-token',async()=>new Response('private-token-detail',{status:401})), error=>error.status===401 && /다시 연결/.test(error.message) && !error.message.includes('private-token-detail'));
});

const fakePat = 'github_pat_' + 'a'.repeat(60);
test('개인 토큰 등록 시 이름·종류·유한한 앱 사용기한을 검증한다',()=>{
  const now=Date.parse('2026-09-17T00:00:00Z');
  const input={label:'조직 레포',token:fakePat,expiresOn:'2026-10-01'};
  assert.equal(validateGitHubCredential(input,now).expiresAt,Date.parse('2026-10-01T23:59:59+09:00'));
  for(const changed of [{token:'ghu_old_app_token'},{token:'ghp_classic'},{label:''},{expiresOn:'2026-02-30'},{expiresOn:'2026-09-16'},{expiresOn:'2027-01-01'}]){
    assert.throws(()=>validateGitHubCredential({...input,...changed},now));
  }
});
