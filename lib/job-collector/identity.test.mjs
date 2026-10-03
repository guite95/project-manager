import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listingIdentity, validateJobId } from './identity.mjs';
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
