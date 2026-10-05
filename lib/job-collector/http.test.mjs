import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHttpClient, robotsPolicy } from './http.mjs';
import { CollectionError } from './config.mjs';

const origin = 'https://zighang.com';
const url = `${origin}/recruitment/11111111-1111-1111-1111-111111111111`;
const config = { requestIntervalMs: 2000, timeoutMs: 1000, maxPages: 10 };
const response = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/plain', ...headers } });

test('원티드에서 명시한 robots 403 예외는 한 번 기록하고 공개 요청을 계속한다', async () => {
  const calls = [];
  const http = createHttpClient('wanted', { ...config, sources: [{id:'wanted', allowRobots403:true}] }, {
    wait: async () => {}, fetchImpl: async input => { calls.push(input); return response('', input.endsWith('robots.txt') ? 403 : 200); },
  });
  await http.get('https://www.wanted.co.kr/wd/123');
  await http.get('https://www.wanted.co.kr/wd/124');
  assert.equal(calls.length, 3);
  assert.deepEqual(http.warnings, [{code:'ROBOTS_HTTP_403_CONTINUED'}]);
});

test('robots 403 예외도 실제 Disallow·서버 오류·공고 접근 제한을 무시하지 않는다', async () => {
  for (const [robotsReply, pageStatus, expected] of [
    [() => response('User-agent: *\nDisallow: /'), 200, 'ROBOTS_DISALLOWED'],
    [() => response('', 500), 200, 'ROBOTS_HTTP_500'],
    [() => response('', 429), 200, 'ROBOTS_HTTP_429'],
    [() => { throw new Error('offline'); }, 200, 'ROBOTS_UNAVAILABLE'],
    [() => response('', 403), 403, 'HTTP_403'],
    [() => response('', 403), 429, 'HTTP_429'],
  ]) {
    const http = createHttpClient('wanted', {...config, sources:[{id:'wanted', allowRobots403:true}]}, {
      wait:async()=>{}, fetchImpl:async input=>input.endsWith('robots.txt')?robotsReply():response('',pageStatus),
    });
    await assert.rejects(()=>http.get('https://www.wanted.co.kr/wd/123'), error=>error.code===expected);
  }
});

test('원티드의 지정한 공개 목록만 JSON 응답을 허용한다', async () => {
  const http = createHttpClient('wanted', config, {wait:async()=>{},fetchImpl:async input=>input.endsWith('robots.txt')?response(''):response('{"data":[]}',200,{'content-type':'application/json'})});
  const list='https://www.wanted.co.kr/api/chaos/navigation/v1/results?country=all&job_group_id=518&job_sort=job.latest_order&limit=20&offset=0';
  assert.equal((await http.get(list)).body,'{"data":[]}');
  await assert.rejects(()=>http.get('https://www.wanted.co.kr/wd/123'), /UNSUPPORTED_CONTENT_TYPE/);
});

test('robots는 가장 긴 경로·동률 Allow·봇별 그룹을 적용한다', () => {
  const policy = robotsPolicy('User-agent: *\nDisallow: /api/\nDisallow: /recruitment/\nAllow: /recruitment/public$\nDisallow: /recruitment/public$');
  assert.equal(policy.allows(`${origin}/api/jobs`), false);
  assert.equal(policy.allows(`${origin}/%61pi/jobs`), false);
  assert.equal(policy.allows(url), false);
  assert.equal(policy.allows(`${origin}/recruitment/public`), true);
  assert.equal(policy.allows(`${origin}/recruitment/public/more`), false);
  const specific = robotsPolicy('User-agent: *\nDisallow: /\nUser-agent: ProjectManagementJobCollector\nAllow: /recruitment/\nCrawl-delay: 3');
  assert.equal(specific.allows(url), true);
  assert.equal(specific.delayMs, 3000);
});

test('robots 확인 실패나 차단이면 공고 본문을 요청하지 않는다', async () => {
  for (const reply of [() => response('Forbidden', 403), () => response('User-agent: *\nDisallow: /recruitment/')]) {
    const calls = [];
    const http = createHttpClient('zighang', config, { wait: async () => {}, fetchImpl: async input => { calls.push(input); return reply(); } });
    await assert.rejects(() => http.get(url), /ROBOTS_(?:HTTP_403|DISALLOWED)/);
    assert.deepEqual(calls, [`${origin}/robots.txt`]);
  }
});

test('사람인 검색 HTML은 4 MiB 이내에서 읽고 더 큰 응답은 중단한다', async () => {
  const search='https://www.saramin.co.kr/zf_user/search/recruit?searchword=ERP';
  for(const [size,allowed] of [[2300000,true],[4*1024*1024+1,false]]) {
    const http=createHttpClient('saramin',config,{wait:async()=>{},fetchImpl:async input=>response(input.endsWith('/robots.txt')?'': 'x'.repeat(size))});
    if(allowed) assert.equal((await http.get(search)).body.length,size);
    else await assert.rejects(()=>http.get(search),/RESPONSE_TOO_LARGE/);
  }
});

test('사람인 상세는 본문이 포함된 공개 view 경로로 요청하고 robots도 그 경로를 검사한다', async () => {
  const calls=[];
  const http=createHttpClient('saramin',config,{wait:async()=>{},fetchImpl:async input=>{calls.push(input);return response('');}});
  const result=await http.get('https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123');
  assert.equal(result.url,'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=123');
  assert.deepEqual(calls,['https://www.saramin.co.kr/robots.txt',result.url]);
});

test('robots는 회차 동안 캐시하고 Crawl-delay와 요청 간격을 지킨다', async () => {
  const calls = [], waits = [];
  let clock = 0, heartbeats = 0;
  const http = createHttpClient('zighang', config, {
    now: () => clock,
    wait: async ms => { waits.push(ms); clock += ms; },
    heartbeat: async () => { heartbeats++; },
    fetchImpl: async input => { calls.push(input); return response(input.endsWith('robots.txt') ? 'User-agent: *\nCrawl-delay: 3' : '<main>공고</main>'); },
  });
  await http.get(url);
  await http.get(url);
  assert.deepEqual(calls, [`${origin}/robots.txt`, url, url]);
  assert.deepEqual(waits, [3000, 3000]);
  assert.equal(heartbeats, 3);
});

test('외부 호스트나 API로 리디렉션되면 추가 요청하지 않는다', async () => {
  for (const location of ['https://127.0.0.1/private', `${origin}/api/jobs`]) {
    const calls = [];
    const http = createHttpClient('zighang', config, {
      wait: async () => {},
      fetchImpl: async input => { calls.push(input); return input.endsWith('robots.txt') ? response('User-agent: *\nAllow: /') : response('', 302, { location }); },
    });
    await assert.rejects(() => http.get(url), /URL_NOT_ALLOWED/);
    assert.equal(calls.length, 2);
  }
});

test('같은 호스트로 이동해도 새 경로에 robots 규칙을 다시 적용한다', async () => {
  const calls = [];
  const http = createHttpClient('zighang', config, {
    wait: async () => {},
    fetchImpl: async input => { calls.push(input); return input.endsWith('robots.txt') ? response('User-agent: *\nDisallow: /private') : response('', 302, { location: '/private' }); },
  });
  await assert.rejects(() => http.get(url), /ROBOTS_DISALLOWED/);
  assert.equal(calls.length, 2);
});

test('응답 크기·형식 상한과 HTTP 429를 고정 오류 코드로 알린다', async () => {
  const replies = [
    [() => response('x', 200, { 'content-length': '9999999' }), 'RESPONSE_TOO_LARGE'],
    [() => response('x'.repeat(2 * 1024 * 1024 + 1)), 'RESPONSE_TOO_LARGE'],
    [() => response('x', 200, { 'content-type': 'application/pdf' }), 'UNSUPPORTED_CONTENT_TYPE'],
    [() => response('private response body', 429), 'HTTP_429'],
  ];
  for (const [reply, code] of replies) {
    const http = createHttpClient('zighang', config, { wait: async () => {}, fetchImpl: async input => input.endsWith('robots.txt') ? response('') : reply() });
    await assert.rejects(() => http.get(url), error => error.code === code && error.message === code);
  }
});

test('lease 갱신 실패와 취소는 robots 확인 중에도 전파된다', async () => {
  let calls = 0;
  const http = createHttpClient('zighang', config, {
    heartbeat: async () => { throw new CollectionError('LEASE_LOST'); },
    fetchImpl: async () => { calls++; return response(''); },
  });
  await assert.rejects(() => http.get(url), /LEASE_LOST/);
  assert.equal(calls, 0);
  const controller = new AbortController();
  const cancelled = createHttpClient('zighang', config, {
    signal: controller.signal,
    fetchImpl: async () => { controller.abort(); throw new Error('aborted'); },
  });
  await assert.rejects(() => cancelled.get(url), /ABORTED/);
});
