import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listingIdentity, validateJobId, jobIdentityKeys, groupDuplicateJobs } from './identity.mjs';
import { parseJobPage } from './parse.mjs';

test('삭제 식별자는 추적 쿼리·앵커·후행 슬래시와 제목·직무 식별자 변경에 영향받지 않는다', () => {
  const url = 'https://zighang.com/recruitment/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const original = parseJobPage('zighang', url, '<h1>개발자</h1><main>공고 본문</main>')[0];
  const revised = parseJobPage('zighang', `${url}/?utm_source=mail#top`, '<script type="application/ld+json">{"@type":"JobPosting","title":"서버 개발자","identifier":"new-id","description":"수정한 본문"}</script>')[0];
  assert.notEqual(original.id, revised.id);
  assert.deepEqual(listingIdentity(original.source, original.url), listingIdentity(revised.source, revised.url));
});

test('같은 회사·직무여도 다른 원문 주소와 다른 사이트는 삭제 범위를 공유하지 않는다', () => {
  assert.notEqual(listingIdentity('wanted', 'https://www.wanted.co.kr/wd/1').exclusionKey,
    listingIdentity('wanted', 'https://www.wanted.co.kr/wd/2').exclusionKey);
  assert.notEqual(listingIdentity('wanted', 'https://www.wanted.co.kr/wd/1').exclusionKey,
    listingIdentity('jasoseol', 'https://jasoseol.com/recruit/1').exclusionKey);
  assert.notEqual(listingIdentity('saramin', 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=1').exclusionKey,
    listingIdentity('saramin', 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=2').exclusionKey);
});

test('비공고 URL과 임의 저장 키는 삭제 식별자로 사용할 수 없다', () => {
  for (const url of ['https://www.wanted.co.kr/', 'https://www.wanted.co.kr/api/job/1', 'https://other.test/wd/1', 'javascript:alert(1)']) {
    assert.throws(() => listingIdentity('wanted', url));
  }
  for (const id of ['', 'recruitment:document:private', '../source', 'a'.repeat(65)]) assert.throws(() => validateJobId(id));
});

test('사이트가 달라도 동일 원문 공고를 가리키면 한 목록으로 묶는다', () => {
  const original = { id: 'original', source: 'saramin', url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123', title: '개발자', company: '회사' };
  const mirror = { id: 'mirror', source: 'zighang', url: 'https://zighang.com/recruitment/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', title: '서버 개발자', company: '회사', originUrls: [original.url] };
  assert.ok(jobIdentityKeys(mirror).includes(listingIdentity(original.source, original.url).exclusionKey));
  const groups = groupDuplicateJobs([mirror, original]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].duplicates.map(job => job.id), [original.id]);
  assert.equal(groupDuplicateJobs([original, {...original,id:'separate',url:'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=456'}]).length, 2);
});

test('명시된 지원 원문 링크만 출처로 읽으며 외부 임의 주소나 추천 공고는 연결하지 않는다', () => {
  const url = 'https://zighang.com/recruitment/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const html = '<script type="application/ld+json">{"@type":"JobPosting","title":"개발자"}</script>'
    + '<a href="https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123&amp;utm_source=site">지원하러 가기</a>'
    + '<a href="https://www.wanted.co.kr/wd/999">추천 공고</a><a href="http://127.0.0.1/">원문</a>';
  const [job] = parseJobPage('zighang', url, html);
  assert.deepEqual(job.originUrls, ['https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123']);
});

test('한 페이지에서 나눈 여러 직무는 목록에서 하나로 합치지 않는다', () => {
  const html = `<script type="application/ld+json">${JSON.stringify([
    {'@type':'JobPosting',identifier:'a',title:'백엔드 개발자'},
    {'@type':'JobPosting',identifier:'b',title:'프론트엔드 개발자'},
  ])}</script>`;
  const jobs = parseJobPage('wanted','https://www.wanted.co.kr/wd/123',html);
  assert.equal(groupDuplicateJobs(jobs).length,2);
});

test('직행 공개 페이지 데이터에서 현재 공고 ID의 지원 주소만 연결한다', () => {
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const current = { id, applyMethod: 'URL', redirectUrl: 'https://www.jobkorea.co.kr/Recruit/GI_Read/123' };
  const recommended = { id: '11111111-2222-3333-4444-555555555555', applyMethod: 'URL', redirectUrl: 'https://www.wanted.co.kr/wd/999' };
  const chunk = `30:${JSON.stringify(['$', 'div', null, {children: [
    ['$', '$L1', null, {recruitment: current}], ['$', '$L1', null, {recruitment: recommended}],
  ]}])}\n`;
  const data = `<script>self.__next_f.push(${JSON.stringify([1,chunk])})</script>`;
  const posting = '<script type="application/ld+json">{"@type":"JobPosting","title":"백엔드 개발자"}</script>';
  const [job] = parseJobPage('zighang', `https://zighang.com/recruitment/${id}`, posting + data);
  assert.deepEqual(job.originUrls, [current.redirectUrl]);
  const [unmatched] = parseJobPage('zighang', `https://zighang.com/recruitment/99999999-bbbb-cccc-dddd-eeeeeeeeeeee`, posting + data);
  assert.deepEqual(unmatched.originUrls, []);
  const [invalidScript] = parseJobPage('zighang', job.url, posting + data.replace('self.__next_f.push(', 'someFunction('));
  assert.deepEqual(invalidScript.originUrls, [], '임의 스크립트는 실행하거나 해석하지 않는다');
});

test('사람인의 같은 공고 ID를 가진 공개 주소는 하나의 삭제 식별자다', () => {
  assert.deepEqual(listingIdentity('saramin','https://saramin.co.kr/zf_user/jobs/view?rec_idx=123'),
    listingIdentity('saramin','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123'));
});
