import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseConfig, sourceUrl, CollectionError } from './config.mjs';
import { dueScheduleKey, nextScheduledAt } from './schedule.mjs';
import { parseJobPage, discoverLinks, matchedKeywords } from './parse.mjs';
import { collectSource } from './collect.mjs';
import { runCollection, watchCollections } from './worker.mjs';
import { parseArguments } from '../../scripts/jobs-worker.mjs';

const origin = 'https://zighang.com';
const urlA = `${origin}/recruitment/11111111-1111-1111-1111-111111111111`;
const urlB = `${origin}/recruitment/22222222-2222-2222-2222-222222222222`;
const source = { id: 'zighang', enabled: true, startUrls: [`${origin}/recruitment`] };
const config = parseConfig({ sources: [source], keywords: ['백엔드', 'Java'], maxPages: 10 });
const now = new Date('2026-10-03T11:00:00Z');
const posting = (changes = {}) => ({
  '@type': 'JobPosting', title: '백엔드 개발자', identifier: { value: 'backend-1' },
  hiringOrganization: { name: '테스트 회사' }, description: '<p>Java 개발</p><script>bad()</script><p>필수 &amp; 우대</p>',
  experienceRequirements: '신입',
  datePosted: '2026-10-01', validThrough: '2026-10-03',
  jobLocation: { address: { addressRegion: '서울', addressLocality: '강남구' } }, ...changes,
});
// script 요소 안의 JSON은 HTML 종료 태그를 이스케이프해서 직렬화한다.
const page = data => `<html><script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script></html>`;

test('예제 설정은 비밀 없이 네 플랫폼을 활성화하고 자소설은 보류한다', async () => {
  const example = parseConfig(JSON.parse(await readFile(new URL('../../config/jobs-worker.example.json', import.meta.url), 'utf8')));
  assert.equal(example.sources[0].id, 'zighang');
  assert.equal(example.requestIntervalMs, 2000);
  assert.deepEqual(example.sources.filter(item=>item.enabled).map(item=>item.id),['zighang','jobkorea','saramin','wanted']);
  assert.equal(example.sources.find(item=>item.id==='jasoseol').disabledReason,'DEFERRED');
  assert.throws(() => parseConfig({ sources: [{ ...source, id: 'unknown' }] }), /INVALID_CONFIG/);
  assert.throws(() => parseConfig({ sources: [source], requestIntervalMs: 0 }), /INVALID_CONFIG/);
});

test('수집원 URL은 외부 호스트·자격증명·인코딩된 API 경로를 거부한다', () => {
  for (const url of [
    'https://localhost/a', 'http://zighang.com/recruitment', 'https://zighang.com.evil.test/a',
    'https://name:password@zighang.com/a', 'https://zighang.com:8443/a', `${origin}/api/jobs`,
    `${origin}/%61pi/jobs`, `${origin}/%2561pi/jobs`, `${origin}/a%2fapi/jobs`, `${urlA}?access-key=secret`,
  ]) assert.throws(() => sourceUrl('zighang', url), /URL_NOT_ALLOWED/);
  assert.equal(sourceUrl('zighang', `${urlA}?utm_source=test#section`), urlA);
  assert.equal(sourceUrl('zighang', `${urlA}/?from=search&sort=recent`), urlA);
  assert.equal(sourceUrl('saramin', 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123&utm_source=test'), 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123');
  assert.throws(() => sourceUrl('saramin', 'https://www.saramin.co.kr/zf_user/jobs/relay/view'), /INVALID_URL/);
});

test('한국 시간 20시 경계와 연말에도 UTC 서버에서 당일 한 회차를 선택한다', () => {
  assert.equal(dueScheduleKey(new Date('2026-10-03T10:59:59.999Z')), null);
  assert.equal(dueScheduleKey(now), '2026-10-03');
  assert.equal(dueScheduleKey(new Date('2026-10-03T14:59:59Z')), '2026-10-03');
  assert.equal(dueScheduleKey(new Date('2026-10-03T15:00:00Z')), null);
  assert.equal(nextScheduledAt(new Date('2026-12-31T14:00:00Z')), '2027-01-01T11:00:00.000Z');
  assert.equal(nextScheduledAt(new Date('2026-10-03T10:00:00Z')), '2026-10-03T11:00:00.000Z');
});

test('복수 직무·본문·지역을 추출하고 한국 날짜 마감은 당일 끝까지 유지한다', () => {
  const jobs = parseJobPage('zighang', urlA, page({ '@graph': [posting(), posting({ identifier: 'front-1', title: '프론트엔드 개발자' })] }), now);
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[0].id, jobs[1].id);
  assert.equal(jobs[0].deadline, '2026-10-03T14:59:59.000Z');
  assert.equal(jobs[0].status, 'OPEN');
  assert.equal(jobs[0].description, 'Java 개발\n필수 & 우대');
  assert.deepEqual(jobs[0].locations, ['서울 강남구']);
  assert.equal(parseJobPage('zighang', urlA, page(posting()), new Date('2026-10-04T00:00:00Z'))[0].status, 'CLOSED');
});

test('수집 시각·추적 URL이 바뀌어도 식별자와 내용 해시는 같고 본문 변경은 감지한다', () => {
  const first = parseJobPage('zighang', urlA, page(posting()), now)[0];
  const second = parseJobPage('zighang', `${urlA}?utm_source=other`, page(posting()), new Date('2026-10-03T12:00:00Z'))[0];
  assert.equal(first.id, second.id);
  assert.equal(first.contentHash, second.contentHash);
  const changed = parseJobPage('zighang', urlA, page(posting({ description: '수정된 업무' })), now)[0];
  assert.equal(first.id, changed.id);
  assert.notEqual(first.contentHash, changed.contentHash);
});

test('누락 본문·시간대는 추정하지 않고 구조화된 경력 개월 수를 보존한다', () => {
  const job = parseJobPage('zighang', urlA, page(posting({ description: null, validThrough: '2026-10-03T18:00', experienceRequirements: { monthsOfExperience: 36 } })), now)[0];
  assert.equal(job.deadline, null);
  assert.equal(job.experience, '경력 3년 이상');
  assert.equal(job.detailStatus, 'MISSING');
  assert.equal(parseJobPage('zighang', urlA, page(posting({ validThrough: '2026-02-30' })), now)[0].deadline, null);
  const fallback = parseJobPage('zighang', urlA, '<main><h1>백엔드</h1><p>업무 내용</p></main>', now)[0];
  assert.equal(fallback.detailStatus, 'UNVERIFIED');
  assert.equal(fallback.company, null);
  assert.throws(() => parseJobPage('zighang', urlA, '<main><h1>Just a moment</h1></main>'), /UNSUPPORTED_PAGE/);
});

test('사이트맵은 외부·API·일반 페이지를 제외하고 외부 엔티티를 해석하지 않는다', () => {
  const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${urlA}</loc></url><url><loc>${origin}/about</loc></url><url><loc>https://evil.test/a</loc></url></urlset>`;
  assert.deepEqual(discoverLinks('zighang', origin, xml, 'application/xml').urls, [urlA]);
  assert.throws(() => discoverLinks('zighang', origin, '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><urlset/>', 'application/xml'), /INVALID_SITEMAP/);
  assert.throws(() => discoverLinks('zighang', origin, '<urlset>', 'application/xml'), /INVALID_SITEMAP/);
  assert.deepEqual(discoverLinks('zighang', origin, `<a href="${urlA}?utm_source=foo">공고</a><a href="/api/jobs">API</a>`, 'text/html').urls, [urlA]);
});

test('짧은 영문 키워드를 다른 단어의 일부로 오인하지 않는다', () => {
  assert.deepEqual(matchedKeywords({ title: 'Retail manager', description: 'JavaScript' }, ['AI', 'Java']), []);
  assert.deepEqual(matchedKeywords({ title: '백엔드 개발자', description: 'Java, AI 서비스' }, ['백엔드', 'Java', 'AI']), ['백엔드', 'Java', 'AI']);
});

test('수집 상한 이후 대기열을 보존하고 다음 회차는 미처리 공고를 우선한다', async () => {
  const calls = [];
  const http = { get: async url => { calls.push(url); return { url, contentType: 'text/html', body: url === source.startUrls[0] ? `<a href="${urlA}">A</a><a href="${urlB}">B</a>` : page(posting()) }; } };
  const limited = { ...config, maxJobs: 1 };
  const first = await collectSource(source, limited, { http, now: () => now });
  assert.equal(first.report.state, 'PARTIAL');
  assert.equal(first.jobs[0].url, urlA);
  assert.deepEqual(first.pendingUrls, [urlB]);
  calls.length = 0;
  const second = await collectSource(source, limited, { http, pendingUrls: first.pendingUrls, now: () => now });
  assert.equal(second.jobs[0].url, urlB);
  assert.deepEqual(calls, [source.startUrls[0], urlB]);
});

test('기존 공고와 삭제 원문의 버전 갱신을 새 목록 탐색보다 먼저 처리한다', async () => {
  const calls = [];
  const result = await collectSource(source,{...config,maxPages:1,maxJobs:1},{refreshUrls:[urlB],http:{get:async url=>{calls.push(url);return{url,body:page(posting()),contentType:'text/html'};}}});
  assert.deepEqual(calls,[urlB]);
  assert.equal(result.jobs[0].url,urlB);
  assert.ok(result.pendingUrls.includes(source.startUrls[0]));
});

test('429에서 해당 수집원을 멈추고 실패를 마감 공고로 만들지 않는다', async () => {
  let requests = 0;
  const result = await collectSource({ ...source, startUrls: [urlA, urlB] }, config, {
    http: { get: async () => { requests++; throw new CollectionError('HTTP_429'); } },
  });
  assert.equal(requests, 1);
  assert.equal(result.report.state, 'FAILED');
  assert.equal(result.jobs.length, 0);
  assert.deepEqual(result.pendingUrls, [urlA, urlB]);
});

test('개별 공고 파싱 실패가 앞서 수집한 정상 공고를 지우지 않는다', async () => {
  const result = await collectSource({ ...source, startUrls: [urlA, urlB] }, config, {
    now: () => now,
    http: { get: async url => ({ url, contentType: 'text/html', body: url === urlA ? page(posting()) : '<h1>unavailable</h1>' }) },
  });
  assert.equal(result.report.state, 'PARTIAL');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.report.errors[0].code, 'UNSUPPORTED_PAGE');
});

test('dry-run은 저장하지 않고 실제 저장은 claim과 heartbeat를 전달한다', async () => {
  const events = [];
  const result = { jobs: [{ id: 'example', description: 'body', title: '제목' }], pendingUrls: [], report: { state: 'SUCCESS' } };
  const dry = await runCollection(config, { collect: async (_source, _config, options) => { assert.equal(options.heartbeat, undefined); return result; } });
  assert.equal(dry.mode, 'dry-run');
  assert.equal('description' in dry.preview[0], false);
  const claim = { token: 'current', pendingUrls: [urlA] };
  const store = { claim: async () => claim, heartbeat: async value => events.push(value.token), finish: async (value, saved) => { assert.equal(value, claim); assert.equal(saved, result); events.push('saved'); } };
  await runCollection(config, { store, collect: async (_source, _config, options) => { assert.deepEqual(options.pendingUrls, [urlA]); await options.heartbeat(); return result; } });
  assert.deepEqual(events, ['current', 'saved']);
});

test('다른 작업자의 claim과 잃어버린 lease는 결과 저장을 막는다', async () => {
  let calls = 0;
  const skipped = await runCollection(config, { store: { claim: async () => null }, collect: async () => { calls++; } });
  assert.equal(skipped.reports[0].state, 'SKIPPED');
  assert.equal(calls, 0);
  const failed = await runCollection(config, {
    store: { claim: async () => ({ pendingUrls: [] }), heartbeat: async () => { throw new CollectionError('LEASE_LOST'); }, finish: async () => { calls++; } },
    collect: async (_source, _config, options) => { await options.heartbeat(); },
  });
  assert.equal(failed.reports[0].error, 'LEASE_LOST');
  assert.equal(calls, 0);
});

test('watch는 20시 전 기다리고, 당일 성공 후 반복하지 않으며 다음 날 다시 실행한다', async () => {
  const controller = new AbortController(), keys = [];
  const dates = ['2026-10-03T10:59:59Z', '2026-10-03T11:00:00Z', '2026-10-03T12:00:00Z', '2026-10-04T11:00:00Z'];
  let index = 0;
  await watchCollections(config, {
    store: {}, signal: controller.signal, now: () => new Date(dates[index]),
    wait: async () => { if (++index === dates.length) controller.abort(); },
    run: async (_config, options) => { keys.push(options.runKey); return { reports: [{ state: 'SUCCESS' }] }; },
  });
  assert.deepEqual(keys, ['2026-10-03', '2026-10-04']);
});

test('CLI는 쓰기를 명시해야 watch를 시작하며 알 수 없는 옵션을 거부한다', () => {
  assert.equal(parseArguments(['collect', '--config', 'sample.json']).apply, false);
  assert.throws(() => parseArguments(['watch', '--config', 'sample.json']), /APPLY_REQUIRED/);
  assert.throws(() => parseArguments(['collect', '--config', 'sample.json', '--aply']), /INVALID_ARGUMENT/);
  assert.throws(() => parseArguments(['list', '--limit', '10000']), /INVALID_ARGUMENT/);
  assert.equal(parseArguments(['watch', '--config', 'sample.json', '--apply']).apply, true);
});
