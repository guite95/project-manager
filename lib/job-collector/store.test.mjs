import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { collectionStore, jobKey } from './store.mjs';
import { parseJobPage } from './parse.mjs';
import { listingIdentity } from './identity.mjs';
import { MANUAL_KEY, WORKER_KEY } from './control.mjs';

test('로컬 DB: 멱등 수집, 목록 필터, 삭제와 재수집 경쟁, 영구 제외', async t => {
  if (!process.env.TEST_DATABASE_URL) { t.skip('TEST_DATABASE_URL 미설정: 로컬 DB 통합 검증 미실행'); return; }
  const { assertTestDatabase } = await import('../test-database.ts');
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 3, connectionTimeoutMillis: 1500 });
  try { await pool.query('SELECT 1'); }
  catch (error) {
    await pool.end();
    if (['EPERM', 'EACCES', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code) || error instanceof AggregateError) {
      t.skip('허용된 로컬 테스트 DB에 연결할 수 없음'); return;
    }
    throw new Error('LOCAL_TEST_DATABASE_UNAVAILABLE');
  }
  const store = collectionStore(pool), sourceKey = 'recruitment:job-source:zighang';
  const id = randomUUID();
  const job = parseJobPage('zighang', `https://zighang.com/recruitment/${id}`, `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: '테스트 개발자', identifier: id, description: '원문', experienceRequirements: '신입' })}</script>`)[0];
  job.company = `테스트-${id}`;
  const changed = parseJobPage('zighang', job.url, '<h1>변경된 공고 제목</h1><main>변경된 본문</main>')[0];
  const sibling = parseJobPage('zighang', job.url, '<script type="application/ld+json">{"@type":"JobPosting","title":"같은 원문의 다른 직무","identifier":"sibling"}</script>')[0];
  const other = parseJobPage('zighang', `https://zighang.com/recruitment/${randomUUID()}`, '<h1>다른 백엔드 개발자 공고</h1><main>지원자격 신입</main>')[0];
  other.company = job.company;
  other.deadline = '2020-01-01T00:00:00.000Z';
  const runKeys = Array.from({ length: 7 }, () => `manual-${randomUUID()}`);
  const cleanupKeys = [sourceKey, ...[job, changed, sibling, other].map(item => jobKey(item.id)), listingIdentity(job.source, job.url).exclusionKey,
    ...runKeys.map(key => `recruitment:job-run:zighang:${key}`)];
  const previous = await pool.query('SELECT value FROM app_setting WHERE key = $1', [sourceKey]);
  const previousControl = await pool.query('SELECT key, value FROM app_setting WHERE key = ANY($1::text[])', [[MANUAL_KEY, WORKER_KEY]]);
  cleanupKeys.push(MANUAL_KEY, WORKER_KEY);
  await pool.query('DELETE FROM app_setting WHERE key = $1', [sourceKey]);
  t.after(async () => {
    await pool.query('DELETE FROM app_setting WHERE key = ANY($1::text[])', [cleanupKeys]);
    if (previous.rows.length) await pool.query('INSERT INTO app_setting(key, value) VALUES ($1, $2::jsonb)', [sourceKey, JSON.stringify(previous.rows[0].value)]);
    for (const row of previousControl.rows) await pool.query('INSERT INTO app_setting(key, value) VALUES ($1, $2::jsonb)', [row.key, JSON.stringify(row.value)]);
    await store.close();
  });
  const claims = await Promise.all([store.claim('zighang', runKeys[0]), store.claim('zighang', runKeys[0])]);
  assert.equal(claims.filter(Boolean).length, 1);
  const result = { jobs: [job], pendingUrls: [], report: { source: 'zighang', state: 'SUCCESS', finishedAt: new Date().toISOString() } };
  await store.finish(claims.find(Boolean), result);
  assert.equal(await store.claim('zighang', runKeys[0]), null);
  await pool.query(`UPDATE app_setting SET value = value || '{"userState":"INTERESTED"}'::jsonb WHERE key = $1`, [jobKey(job.id)]);
  const first = (await pool.query('SELECT value FROM app_setting WHERE key = $1', [jobKey(job.id)])).rows[0].value;
  const secondClaim = await store.claim('zighang', runKeys[1]);
  await store.finish(secondClaim, result);
  assert.equal(await store.claim('zighang', runKeys[0]), null, '새 수동 회차 뒤에도 과거 완료 회차를 재실행하지 않는다');
  const same = (await pool.query('SELECT value FROM app_setting WHERE key = $1', [jobKey(job.id)])).rows[0].value;
  assert.equal(same.revision, 1);
  assert.equal(same.firstSeenAt, first.firstSeenAt);
  assert.equal(same.userState, 'INTERESTED');
  const thirdClaim = await store.claim('zighang', runKeys[2]);
  await store.finish(thirdClaim, { ...result, jobs: [{ ...job, contentHash: 'changed', description: '수정' }] });
  assert.equal((await store.list(500)).find(item => item.id === job.id).revision, 2);
  assert.equal('description' in (await store.list(500)).find(item => item.id === job.id), false);
  const oldClaim = await store.claim('zighang', runKeys[3]);
  await pool.query(`UPDATE app_setting SET value = value || '{"leaseUntil":0}'::jsonb WHERE key = $1`, [sourceKey]);
  const newClaim = await store.claim('zighang', runKeys[3]);
  assert.ok(newClaim);
  await assert.rejects(() => store.heartbeat(oldClaim), /LEASE_LOST/);
  await assert.rejects(() => store.finish(oldClaim, result), /LEASE_LOST/);
  await store.finish(newClaim, result);
  const status = (await store.status()).find(item => item.source === 'zighang');
  assert.equal(status.state, 'SUCCESS');
  assert.equal('token' in status, false);
  assert.equal('pendingUrls' in status, false);

  await store.finish(await store.claim('zighang', runKeys[4]), { ...result, jobs: [job, sibling, other] });
  const page = await store.listPage({ query: job.company, source: 'zighang', limit: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal('description' in page.items[0], false);
  const next = await store.listPage({ query: job.company, limit: 1, offset: 1 });
  assert.notEqual(page.items[0].id, next.items[0].id);
  const closed = await store.listPage({ query: job.company, status: 'CLOSED' });
  assert.deepEqual(closed.items.map(item => item.id), [other.id]);
  assert.equal((await store.get(other.id)).status, 'CLOSED');
  assert.equal((await store.get(job.id)).description, job.description);

  const claim = await store.claim('zighang', runKeys[5]);
  await Promise.all([store.remove(job.id), store.finish(claim, { ...result, jobs: [changed, other] })]);
  for (const item of [job, sibling, changed]) assert.equal(await store.get(item.id), null);
  assert.ok(await store.get(other.id), '별도 원문의 공고는 남긴다');
  assert.equal((await store.remove(job.id)).deleted, 0, '삭제 재요청은 멱등이다');
  const report = await store.finish(await store.claim('zighang', runKeys[6]), { ...result, jobs: [job, sibling, changed, other] });
  assert.equal(report.excluded, 3);
  assert.equal(report.stored, 1);
  const deletedRows = await pool.query('SELECT key FROM app_setting WHERE key = ANY($1::text[])', [[job, sibling, changed].map(item => jobKey(item.id))]);
  assert.equal(deletedRows.rowCount, 0, '제외된 공고 본문은 재저장하지 않는다');
  assert.equal((await store.listPage({ query: job.company })).total, 1);
  const exclusion = (await pool.query('SELECT value FROM app_setting WHERE key = $1', [listingIdentity(job.source, job.url).exclusionKey])).rows[0].value;
  assert.equal('description' in exclusion, false);
  assert.equal('title' in exclusion, false);
  assert.equal(exclusion.url, job.url);

  // 과거 저장 데이터도 필터링한 뒤 페이지·전체 건수를 계산하고, GET은 원문을 바꾸지 않는다.
  const legacyRows = ['자재관리 직원', 'Security Engineer', 'Backend Engineer', '프론트엔드 개발자'].map((title, index) => ({
    ...job, id: randomUUID().replaceAll('-', '').padEnd(64, '0'), title, company: `legacy-${id}`,
    description: index === 0 ? 'ERP 사용' : '소프트웨어 개발', experience: index === 2 ? '5년 이상' : '신입',
    firstSeenAt: new Date().toISOString(), revision: 8,
  }));
  for (const item of legacyRows) {
    item.url = `https://zighang.com/recruitment/${randomUUID()}`;
    cleanupKeys.push(jobKey(item.id));
    await pool.query('INSERT INTO app_setting(key,value) VALUES ($1,$2::jsonb)', [jobKey(item.id), JSON.stringify(item)]);
  }
  const legacyPage = await store.listPage({ query: `legacy-${id}`, limit: 1 });
  assert.equal(legacyPage.total, 1);
  assert.deepEqual(legacyPage.items.map(item => item.title), ['프론트엔드 개발자']);
  assert.equal('description' in legacyPage.items[0], false);
  assert.equal((await store.listPage({ query: `legacy-${id}`, offset: 1 })).items.length, 0);
  assert.equal(await store.get(legacyRows[0].id), null);
  const unchanged = await pool.query('SELECT value FROM app_setting WHERE key=$1', [jobKey(legacyRows[0].id)]);
  assert.deepEqual(unchanged.rows[0].value, legacyRows[0]);

  const refreshKey = `manual-${randomUUID()}`;
  cleanupKeys.push(`recruitment:job-run:zighang:${refreshKey}`);
  const newlyRejected = { ...other, id: randomUUID().replaceAll('-', '').padEnd(64, '0'), title: '경리 사무원' };
  cleanupKeys.push(jobKey(newlyRejected.id));
  const refreshed = await store.finish(await store.claim('zighang', refreshKey), { ...result, jobs: [], rejectedJobs: [
    { ...legacyRows[3], experience: '5년 이상', contentHash: 'now-senior' }, newlyRejected,
  ] });
  assert.equal(refreshed.stored, 0);
  assert.equal(await store.get(legacyRows[3].id), null, '기존 공고의 경력 조건이 바뀌면 목록에서 제외한다');
  assert.equal((await pool.query('SELECT key FROM app_setting WHERE key=$1', [jobKey(newlyRejected.id)])).rowCount, 0);
  assert.equal((await pool.query('SELECT value FROM app_setting WHERE key=$1', [jobKey(legacyRows[3].id)])).rows[0].value.revision, 9);

  const original = { ...job, id: randomUUID().replaceAll('-', '').padEnd(64, '0'), source: 'wanted',
    url: `https://www.wanted.co.kr/wd/${Date.now()}`, company: `duplicates-${id}` };
  const mirror = { ...job, id: randomUUID().replaceAll('-', '').padEnd(64, '0'),
    url: `https://zighang.com/recruitment/${randomUUID()}`, company: original.company, originUrls: [original.url] };
  const laterMirror = { ...mirror, id: randomUUID().replaceAll('-', '').padEnd(64, '0'), url: `https://zighang.com/recruitment/${randomUUID()}` };
  for (const item of [original,mirror,laterMirror]) cleanupKeys.push(jobKey(item.id), listingIdentity(item.source,item.url).exclusionKey);
  for (const item of [original,mirror]) await pool.query('INSERT INTO app_setting(key,value) VALUES ($1,$2::jsonb)', [jobKey(item.id), JSON.stringify(item)]);
  assert.equal((await store.listPage({query:original.company})).total, 1, '여러 플랫폼의 동일 원문은 한 건이다');
  const duplicateRun = `manual-${randomUUID()}`;
  cleanupKeys.push(`recruitment:job-run:zighang:${duplicateRun}`);
  const duplicateClaim = await store.claim('zighang',duplicateRun);
  await Promise.all([store.remove(mirror.id), store.finish(duplicateClaim, {...result,jobs:[laterMirror]})]);
  for (const item of [original,mirror,laterMirror]) assert.equal(await store.get(item.id), null, '다른 플랫폼의 사본도 삭제되고 동시 수집으로 살아나지 않는다');
  const legacyDeleted = {...job, id:randomUUID().replaceAll('-','').padEnd(64,'0'), url:`https://zighang.com/recruitment/${randomUUID()}`};
  const legacyOriginal = {...original, id:randomUUID().replaceAll('-','').padEnd(64,'0'), url:`https://www.wanted.co.kr/wd/${Date.now()+1}`};
  const legacyExclusion = listingIdentity(legacyDeleted.source,legacyDeleted.url);
  for (const item of [legacyDeleted,legacyOriginal]) cleanupKeys.push(jobKey(item.id),listingIdentity(item.source,item.url).exclusionKey);
  await pool.query('INSERT INTO app_setting(key,value) VALUES ($1,$2::jsonb)',[legacyExclusion.exclusionKey,JSON.stringify({source:legacyDeleted.source,url:legacyDeleted.url,deletedAt:'2026-10-01T00:00:00Z'})]);
  await pool.query('INSERT INTO app_setting(key,value) VALUES ($1,$2::jsonb)',[jobKey(legacyOriginal.id),JSON.stringify(legacyOriginal)]);
  const oldExclusionRefresh = await store.claim('zighang',`manual-${randomUUID()}`);
  cleanupKeys.push(`recruitment:job-run:zighang:${oldExclusionRefresh.runKey}`);
  assert.ok(oldExclusionRefresh.refreshUrls.includes(legacyDeleted.url), '기존 삭제 공고도 원문 연결 확인을 위해 먼저 읽는다');
  await store.finish(oldExclusionRefresh,{...result,jobs:[],rejectedJobs:[{...legacyDeleted,originUrls:[legacyOriginal.url]}]});
  assert.equal(await store.get(legacyOriginal.id),null,'삭제 원문에서 새로 확인한 타 플랫폼 사본도 제외한다');
  const legacyAfter = (await pool.query('SELECT value FROM app_setting WHERE key=$1',[legacyExclusion.exclusionKey])).rows[0].value;
  assert.equal(legacyAfter.deletedAt,'2026-10-01T00:00:00Z');
  assert.equal('description' in legacyAfter,false);
  assert.equal((await pool.query('SELECT key FROM app_setting WHERE key=ANY($1::text[])',[[jobKey(legacyDeleted.id),jobKey(legacyOriginal.id)]])).rowCount,0);

  await pool.query('DELETE FROM app_setting WHERE key = ANY($1::text[])', [[MANUAL_KEY, WORKER_KEY]]);
  assert.deepEqual(await store.controlStatus(), { request: null, workerSeenAt: null, workerOnline: false, sources: [] });
  await store.touchWorker([{id:'zighang',enabled:true,startUrls:['https://zighang.com/']},{id:'wanted',enabled:false,disabledReason:'HTTP_403',startUrls:['https://www.wanted.co.kr/']}]);
  assert.deepEqual((await store.controlStatus()).sources,[{id:'zighang',enabled:true},{id:'wanted',enabled:false,reason:'HTTP_403'}]);
  await pool.query('DELETE FROM app_setting WHERE key=$1',[WORKER_KEY]);
  assert.equal((await pool.query('SELECT key FROM app_setting WHERE key = ANY($1::text[])', [[MANUAL_KEY, WORKER_KEY]])).rowCount, 0, '상태 조회는 데이터를 생성하지 않는다');
  const requests = await Promise.all([store.requestManual(), store.requestManual()]);
  assert.equal(requests.filter(item => item.created).length, 1);
  assert.equal(requests[0].request.runKey, requests[1].request.runKey);
  const manualClaims = await Promise.all([store.claimManual(), store.claimManual()]);
  assert.equal(manualClaims.filter(Boolean).length, 1);
  const firstManual = manualClaims.find(Boolean);
  const active = await store.requestManual();
  assert.equal(active.created, false);
  assert.equal('token' in active.request, false);
  assert.equal('leaseUntil' in (await store.controlStatus()).request, false);
  await pool.query(`UPDATE app_setting SET value = value || '{"leaseUntil":0}'::jsonb WHERE key = $1`, [MANUAL_KEY]);
  const recovered = await store.claimManual();
  assert.equal(recovered.runKey, firstManual.runKey);
  assert.equal(recovered.attempts, 2);
  await assert.rejects(() => store.heartbeatManual(firstManual), /LEASE_LOST/);
  await assert.rejects(() => store.finishManual(firstManual, { state: 'SUCCESS' }), /LEASE_LOST/);
  await store.heartbeatManual(recovered);
  await store.finishManual(recovered, { state: 'QUEUED' });
  const waiting = await store.claimManual();
  assert.equal(waiting.attempts, 2, '수집원 점유로 기다리는 것은 중단 횟수에 포함하지 않는다');
  await store.finishManual(waiting, { state: 'SUCCESS' });
  await store.touchWorker();
  assert.equal((await store.controlStatus()).workerOnline, true);
  assert.equal((await store.controlStatus()).request.state, 'SUCCESS');
  const nextRequest = await store.requestManual();
  assert.equal(nextRequest.created, true);
  assert.notEqual(nextRequest.request.runKey, firstManual.runKey);
  await store.claimManual();
  await pool.query(`UPDATE app_setting SET value = value || '{"leaseUntil":0,"attempts":3}'::jsonb WHERE key = $1`, [MANUAL_KEY]);
  assert.equal(await store.claimManual(), null);
  assert.equal((await store.controlStatus()).request.error, 'RETRY_EXHAUSTED');
  assert.equal((await store.requestManual()).created, true);
});
