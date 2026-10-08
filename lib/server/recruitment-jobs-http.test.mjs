import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { RecruitmentError } from '../recruitment.ts';
import { parseJobQuery, requireJobId } from '../recruitment-jobs.ts';

// Next 실행 환경과 저장소만 대체하고 실제 라우트/소유자 검사/JSON 검증을 실행한다.
function load(relative, imports) {
  const output = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected test import: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
class AccessError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function harness() {
  let actor = { role: 'OWNER' };
  let completion = { hiddenIds: ['a'.repeat(64)] };
  const calls = [];
  const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };
  const http = load('../access/http.ts', {
    'next/headers': { cookies: async () => ({ get: () => undefined }) },
    'next/server': next, react: { cache: fn => fn },
    '../server/task-access.ts': {}, '../session.ts': {},
    './store.ts': { AccessError, resolveActor: async () => actor },
  });
  const recruitment = load('./recruitment-http.ts', {
    'next/server': next, '../access/http.ts': http,
    '../access/store.ts': { AccessError }, '../recruitment.ts': { RecruitmentError },
  });
  const imports = {
    'next/server': next,
    '@/lib/access/http': http,
    '@/lib/recruitment': { RecruitmentError },
    '@/lib/recruitment-jobs': { parseJobQuery },
    '@/lib/server/recruitment-http': recruitment,
    '@/lib/server/recruitment-jobs-store': {
      listRecruitmentJobs: async input => { calls.push(['list', input]); return { items: [], total: 0, ...input }; },
      getRecruitmentJob: async id => { calls.push(['get', id]); return null; },
      deleteRecruitmentJob: async id => { calls.push(['delete', id]); return { deleted: 1 }; },
      completeRecruitmentJobCoverLetter: async id => { requireJobId(id); calls.push(['complete', id]); return completion; },
      requestJobCollection: async () => { calls.push(['collect']); return { created: true, request: { runKey: 'manual-test', state: 'QUEUED' } }; },
      getJobCollectionStatus: async () => { calls.push(['collect-status']); return { request: null, workerOnline: false, workerSeenAt: null }; },
    },
  };
  return {
    calls, actor: value => { actor = value; }, completion: value => { completion = value; },
    list: load('../../app/api/recruitment/jobs/route.ts', imports),
    item: load('../../app/api/recruitment/jobs/[id]/route.ts', imports),
    collect: load('../../app/api/recruitment/jobs/collect/route.ts', imports),
  };
}
const context = { params: Promise.resolve({ id: 'a'.repeat(64) }) };
const url = `https://app.test/api/recruitment/jobs/${'a'.repeat(64)}`;

test('채용공고 API 자체가 비로그인·관리자·멤버의 조회·삭제·작성 완료를 저장소 접근 전에 거부한다', async () => {
  const h = harness();
  for (const actor of [null, { role: 'ADMIN' }, { role: 'MEMBER' }]) {
    h.actor(actor);
    for (const response of [await h.list.GET(new Request('https://app.test/api/recruitment/jobs')),
      await h.item.GET(new Request(url), context),
      await h.item.DELETE(new Request(url, { method: 'DELETE' }), context),
      await h.item.PATCH(new Request(url, { method: 'PATCH' }), context),
      await h.collect.GET(),
      await h.collect.POST(new Request('https://app.test/api/recruitment/jobs/collect', { method: 'POST' }))]) {
      assert.equal(response.status, actor ? 403 : 401);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
  }
  assert.deepEqual(h.calls, []);
});

test('수동 수집은 같은 출처의 빈 JSON 요청만 접수하고 실제 수집 완료와 구분해 202를 반환한다', async () => {
  const h = harness();
  const url = 'https://app.test/api/recruitment/jobs/collect';
  const request = (origin, body = '{}', contentType = 'application/json') => new Request(url, {
    method: 'POST', headers: { ...(origin ? { origin } : {}), 'Content-Type': contentType }, body,
  });
  for (const [input, status] of [[request('https://other.test'), 403], [request(''), 403],
    [request('https://app.test', '{}', 'text/plain'), 415], [request('https://app.test', '[]'), 400],
    [request('https://app.test', '{"url":"https://untrusted.test"}'), 400]]) {
    assert.equal((await h.collect.POST(input)).status, status);
  }
  assert.deepEqual(h.calls, []);
  const response = await h.collect.POST(request('https://app.test'));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await response.json()).request.state, 'QUEUED');
  assert.deepEqual(h.calls, [['collect']]);
  const statusResponse = await h.collect.GET();
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).workerOnline, false);
});

test('소유자라도 출처·JSON 본문 검증을 통과해야 공고를 삭제할 수 있다', async () => {
  const h = harness();
  const request = (origin, body = '{}', contentType = 'application/json') => new Request(url, {
    method: 'DELETE', headers: { ...(origin ? { origin } : {}), 'Content-Type': contentType }, body,
  });
  for (const [input, status] of [[request('https://elsewhere.test'), 403], [request(''), 403],
    [request('https://app.test', '{}', 'text/plain'), 415], [request('https://app.test', '[]'), 400]]) {
    assert.equal((await h.item.DELETE(input, context)).status, status);
  }
  assert.deepEqual(h.calls, []);
  const response = await h.item.DELETE(request('https://app.test'), context);
  assert.equal(response.status, 200);
  assert.deepEqual(h.calls, [['delete', 'a'.repeat(64)]]);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('목록의 검색 조건을 전달하고 삭제된 공고의 상세는 404로 응답한다', async () => {
  const h = harness();
  const response = await h.list.GET(new Request('https://app.test/api/recruitment/jobs?source=wanted&page=2'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(h.calls[0], ['list', { query: '', source: 'wanted', status: '', limit: 30, offset: 30 }]);
  assert.equal((await h.list.GET(new Request('https://app.test/api/recruitment/jobs?page=-1'))).status, 400);
  assert.equal((await h.item.GET(new Request(url), context)).status, 404);
});

test('자소서 작성 완료는 같은 출처의 정해진 상태만 허용하고 삭제를 호출하지 않는다', async () => {
  const h = harness();
  const request = (origin = 'https://app.test', body = '{"userState":"COVER_LETTER_WRITTEN"}', contentType = 'application/json') => new Request(url, {
    method: 'PATCH', headers: { ...(origin ? { origin } : {}), 'Content-Type': contentType }, body,
  });
  for (const [input, status] of [[request('https://other.test'), 403], [request(''), 403],
    [request('https://app.test', '{}', 'text/plain'), 415],
    ...['{}', '[]', 'null', '{', '{"userState":"NEW"}', '{"userState":"COVER_LETTER_WRITTEN","url":"https://other.test"}']
      .map(body => [request('https://app.test', body), 400])]) {
    assert.equal((await h.item.PATCH(input, context)).status, status);
  }
  assert.equal((await h.item.PATCH(request(), { params: Promise.resolve({ id: 'invalid' }) })).status, 400);
  assert.deepEqual(h.calls, []);
  const response = await h.item.PATCH(request(), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await response.json(), { hiddenIds: ['a'.repeat(64)] });
  assert.deepEqual(h.calls, [['complete', 'a'.repeat(64)]]);

  h.completion(null);
  assert.equal((await h.item.PATCH(request(), context)).status, 404);
});
