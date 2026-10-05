import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectSource } from './collect.mjs';
import { parseConfig } from './config.mjs';

const source = { id: 'zighang', enabled: true, startUrls: ['https://zighang.com/recruitment/11111111-1111-1111-1111-111111111111'] };
const config = parseConfig({ sources: [source], keywords: ['ERP'] });
async function collect(title, description = '', experienceRequirements = '신입', extra = {}) {
  return collectSource(source, config, { http: { get: async url => ({ url, contentType: 'text/html', body:
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title, description, experienceRequirements, ...extra })}</script>` }) } });
}

test('연차 범위의 년차 표기는 최소 연차로 판단한다', async () => {
  for (const [range, included] of [['2년차~4년차',true],['2년 ~ 4년차',true],['4년차~6년차',false]]) {
    const result=await collect(`[${range}] Software Engineer`,'자격요건\n백엔드 개발 경험 1년 이상','신입·경력');
    assert.equal(result.jobs.length,included?1:0,range);
  }
});

test('ERP 키워드가 없어도 IT 직군 전반의 신입 공고를 통과시킨다', async () => {
  for (const title of ['백엔드 개발자', 'Frontend Engineer', '모바일 앱 개발자', '게임 클라이언트 프로그래머',
    '임베디드 SW 개발', '의료로봇 운영SW개발 연구원', '웨어러블 로봇 AI 엔지니어', '데이터 분석가',
    'Data Scientist', 'ML Engineer', '클라우드 인프라 관제(OP)', '네트워크 엔지니어', '서버 시스템 운영',
    'DBA', 'SRE', 'DevOps Engineer', '소프트웨어 QA 테스터', 'IT 서비스 기획자', '디지털 프로덕트 매니저',
    'UX/UI 디자이너', 'IT 헬프데스크', '솔루션 기술지원', 'ERP 시스템 유지보수', '전산 담당자',
    'Android Developer', 'iOS Engineer', 'QA Engineer', '웹 퍼블리셔', 'DX/AX 컨설턴트']) {
    assert.equal((await collect(title)).jobs.length, 1, title);
  }
});

test('보안 직무·단순 사무·출장 수리를 IT 단어가 있어도 제외한다', async () => {
  for (const [title, body] of [
    ['정보보안 엔지니어', 'Python 자동화 개발'], ['Security Engineer', 'Java'],
    ['보안관제 담당자', '클라우드 모니터링'], ['DevSecOps Engineer', 'DevOps'],
    ['개인정보보호 담당', '전산 시스템'], ['모의해킹 컨설턴트', '소프트웨어 분석'],
    ['자재관리 직원', '담당업무 지게차 운전. 우대사항 ERP 사용 가능'],
    ['경리 사무원', 'ERP 시스템 및 이카운트 사용'], ['영상미술팀 사무지원', '전산입력 및 사이트관리'],
    ['자동차 서비스 리셉션', '전산입력 및 월마감'], ['건설업 견적 담당', '전산응용건축제도기능사 우대'],
    ['노트북 출장 수리 기사', '기본 소프트웨어 설정 지원'],
    ['데이터복구 엔지니어', '고객 현장 출동. HDD 복구 및 전산 앱 활용'],
  ]) assert.equal((await collect(title, body)).jobs.length, 0, title);
});

test('일반 개발의 보안 요건과 회사 이름은 보안 직무로 오인하지 않는다', async () => {
  assert.equal((await collect('백엔드 개발자', '담당업무 API 개발 및 인증·보안 강화. 우대사항 보안 지식')).jobs.length, 1);
  assert.equal((await collect('[보안회사] 프론트엔드 개발자', '담당업무 관리자 웹 UI 개발')).jobs.length, 1);
  assert.equal((await collect('IT 엔지니어', '담당업무 보안관제 및 침해사고 대응. 지원자격 신입')).jobs.length, 0);
  assert.equal((await collect('사무직', '담당업무 전산입력. 우대사항 ERP 개발자와 소통 경험')).jobs.length, 0);
});

test('신입~3년 지원 가능 범위와 필수·우대 경력을 구분한다', async () => {
  for (const experience of ['신입', '신입·경력', '경력 무관', '경력 1~3년', '경력 2년 이상',
    '경력 3년 이상', '경력 2~5년', '경력 3년차', '0–3 years of experience',
    '3+ years of experience', 'No experience required', { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: 36 }]) {
    assert.equal((await collect('Backend Engineer', '', experience)).jobs.length, 1, JSON.stringify(experience));
  }
  for (const experience of ['경력 4년 이상', '경력 5~10년', '경력 3년 초과', '4+ years of experience',
    { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: 48 }]) {
    assert.equal((await collect('Backend Engineer', '', experience)).jobs.length, 0, JSON.stringify(experience));
  }
  assert.equal((await collect('Java 개발자', '지원자격 개발 경력 2년 이상. 우대사항 Java 개발 경력 5년 이상', null)).jobs.length, 1);
  assert.equal((await collect('Java 개발자', '지원자격 개발 경력 5년 이상. 우대사항 클라우드 경력 1년', null)).jobs.length, 0);
  assert.equal((await collect('신입 백엔드 개발자', '지원자격 신입 또는 경력 5년 이상', null)).jobs.length, 1);
});

test('경력 불명·상충 조건이나 복리후생 숫자로는 신입 가능 판정을 만들지 않는다', async () => {
  for (const [title, body, experience] of [
    ['Backend Engineer 미들', '필요 역량 Java, Docker', null],
    ['개발자', '복리후생 신입사원 교육, 3년 근속 포상', null],
    ['개발자', '2026년 10월 모집. 3년간 성장한 회사', null],
    ['개발자', '우대사항 경력 1년 이상', null],
    ['개발자', '지원자격 개발 경력 5년 이상', '신입'],
    ['개발자', '지원자격 개발 경력 2년 이상 및 Java 경력 5년 이상', null],
  ]) assert.equal((await collect(title, body, experience)).jobs.length, 0, title + body);
});

test('마감 공고도 직군·연차 필터를 우회하지 않는다', async () => {
  const result = await collect('경리 사무원', 'ERP 사용', '신입', { validThrough: '2020-01-01' });
  assert.equal(result.jobs.length, 0);
  assert.equal(result.report.filtered, 1);
});

test('회사 소개의 개발자와 신입 불가 문구를 지원 가능 신호로 오인하지 않는다', async () => {
  assert.equal((await collect('지원 담당자', '개발자와 함께 성장하는 회사. 담당업무 자료 입력 및 문서 정리. 지원자격 신입', null)).jobs.length, 0);
  assert.equal((await collect('개발자', '지원자격 신입 지원 불가. 경력자 채용', null)).jobs.length, 0);
  assert.equal((await collect('Backend Engineer', '', 'More than 3 years of experience')).jobs.length, 0);
});
