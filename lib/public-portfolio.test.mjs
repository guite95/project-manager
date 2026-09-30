import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePublicPortfolio } from './public-portfolio.ts';
import { isPublicPortfolioRead } from './access/public-portfolio.ts';
import { routeRequirement, permits } from './access/policy.ts';

export const sample = () => ({ published: true, content: { name: '테스트', headline: '테스트 개발자', introduction: ['소개'], links: [{ label: 'GitHub', url: 'https://github.com/example' }], strengths: [{ title: '역량', body: '설명' }], skills: [{ title: 'Backend', items: ['Java'] }], projects: [{ id: 'sample', title: '프로젝트', category: '개인', description: '소개', role: '개발', highlights: ['작업'], stack: ['Java'], links: [] }], activities: [{ title: '교육', detail: '수료', period: '' }] } });
test('공개 본문은 허용한 필드만 보존하고 지원용 정보·원본 링크를 합치지 않는다', () => {
  const input = sample();
  input.credentials = [{ identifier: 'private-credential' }];
  input.content.phone = 'private-phone';
  input.content.sourceUrls = ['https://drive.google.com/private-original'];
  input.content.projects[0].privateNotes = 'private-note';
  const parsed = parsePublicPortfolio(input);
  assert.deepEqual(parsed, sample());
  assert.doesNotMatch(JSON.stringify(parsed), /private-/);
});
test('공개 여부·링크·중복 프로젝트·입력 크기를 검증한다', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,secret', 'http://example.com', 'https://user:secret@example.com']) {
    const input = sample(); input.content.links[0].url = url;
    assert.throws(() => parsePublicPortfolio(input));
  }
  assert.throws(() => parsePublicPortfolio({ ...sample(), published: 'true' }));
  const duplicate = sample(); duplicate.content.projects.push(duplicate.content.projects[0]);
  assert.throws(() => parsePublicPortfolio(duplicate));
  const large = sample(); large.content.name = 'x'.repeat(101);
  assert.throws(() => parsePublicPortfolio(large));
  const excessive = sample(); excessive.content.projects = Array.from({ length: 20 }, (_, i) => ({ ...excessive.content.projects[0], id: `p${i}`, highlights: ['x'.repeat(2000), 'x'.repeat(2000), 'x'.repeat(2000)] }));
  assert.throws(() => parsePublicPortfolio(excessive), error => error.status === 413);
});
test('익명 공개 조회는 정확한 한 경로만 허용하고 관리 화면·API는 OWNER 전용이다', () => {
  for (const method of ['GET', 'HEAD']) assert.equal(isPublicPortfolioRead('/portfolio/show', method), true);
  for (const path of ['/portfolio', '/portfolio/public', '/api/portfolio/public', '/api/portfolio/credentials', '/portfolio/show/extra', '/portfolio/%73how', '/portfolio/show%2f..%2fpublic']) {
    for (const method of ['GET', 'HEAD', 'PUT']) assert.equal(isPublicPortfolioRead(path, method), false);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.equal(isPublicPortfolioRead('/portfolio/show', method), false);
  for (const path of ['/portfolio/public', '/api/portfolio/public']) for (const method of ['GET', 'HEAD', 'PUT']) {
    assert.equal(permits(null, routeRequirement(path, method)), false);
    for (const role of ['ADMIN', 'MEMBER', 'OWNER']) assert.equal(permits({ id: 'u', role, memberships: [] }, routeRequirement(path, method)), role === 'OWNER');
  }
});
