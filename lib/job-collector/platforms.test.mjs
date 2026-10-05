import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfig, sourceUrl } from './config.mjs';
import { runCollection, runManualRequest } from './worker.mjs';
import { parseJobPage, discoverLinks } from './parse.mjs';
import { evaluateJob } from './eligibility.mjs';

const flight = value => `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(value)}\n`])})</script>`;
const wantedList='https://www.wanted.co.kr/api/chaos/navigation/v1/results?country=all&job_group_id=518&job_sort=job.latest_order&limit=20&offset=0';
const wantedPage = data => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{initialData:{id:123,position:'백엔드 개발자',company:{company_name:'회사'},main_tasks:'서버 개발',requirements:'개발 경험',career:{annual_from:2,annual_to:5,is_newbie:false},status:'open',...data}}}})}</script>`;

test('원티드 공개 목록은 고정 경로와 필터만 허용하고 다른 API는 차단한다', () => {
  assert.equal(sourceUrl('wanted',wantedList),wantedList);
  for (const url of [wantedList.replace('/navigation/v1/results','/resumes/v1'),wantedList.replace('limit=20','limit=10000'),wantedList+'&token=secret',wantedList+'&user_id=123',wantedList.replace('/api/','/%61pi/')]) {
    assert.throws(()=>sourceUrl('wanted',url),/URL_NOT_ALLOWED/);
  }
});

test('원티드 JSON 목록의 ID와 같은 조건의 다음 페이지만 따라간다', () => {
  const next=wantedList.replace('offset=0','offset=20');
  const result=discoverLinks('wanted',wantedList,JSON.stringify({data:[{id:123},{id:'124'},{id:'../login'},{id:123}],links:{next}}),'application/json');
  assert.deepEqual(result.urls,['https://www.wanted.co.kr/wd/123','https://www.wanted.co.kr/wd/124',next]);
  for(const unsafe of [next.replace('job_group_id=518','job_group_id=507'),next.replace('offset=20','offset=200'),'https://evil.test/']) {
    assert.deepEqual(discoverLinks('wanted',wantedList,JSON.stringify({data:[],links:{next:unsafe}}),'application/json').urls,[]);
  }
  assert.equal(discoverLinks('wanted',wantedList,'{"data":[],"links":{"next":null}}','application/json').complete,true);
  assert.throws(()=>discoverLinks('wanted',wantedList,'{"error":"oops"}','application/json'),/UNSUPPORTED_PAGE/);
});

test('원티드는 현재 공고 데이터에서 연차와 모집 상태를 읽는다', () => {
  const [job]=parseJobPage('wanted','https://www.wanted.co.kr/wd/123',wantedPage());
  assert.equal(job.experience,'경력 2~5년');
  assert.equal(job.company,'회사');
  assert.equal(job.status,'OPEN');
  assert.match(job.description,/자격요건\n개발 경험/);
  assert.equal(evaluateJob(job).decision,'INCLUDE');
  for(const [career,decision] of [[{is_newbie:true,annual_from:0,annual_to:10},'INCLUDE'],[{annual_from:4,annual_to:10},'EXCLUDE'],[{},'REVIEW']]) {
    assert.equal(evaluateJob(parseJobPage('wanted','https://www.wanted.co.kr/wd/123',wantedPage({career}))[0]).decision,decision);
  }
  assert.equal(parseJobPage('wanted','https://www.wanted.co.kr/wd/123',wantedPage({status:'close'}))[0].status,'CLOSED');
  assert.equal(parseJobPage('wanted','https://www.wanted.co.kr/wd/123',wantedPage({status:'active'}))[0].status,'OPEN');
  assert.throws(()=>parseJobPage('wanted','https://www.wanted.co.kr/wd/123',wantedPage({id:456})),/UNSUPPORTED_PAGE/);
});

test('원티드 JSON-LD의 단순 경력 표기는 실제 연차와 마감 상태로 보완한다', () => {
  const html=wantedPage({status:'close'})+`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:'백엔드 개발자',experienceRequirements:['경력']})}</script>`;
  const [job]=parseJobPage('wanted','https://www.wanted.co.kr/wd/123',html);
  assert.equal(job.experience,'경력 2~5년');
  assert.equal(job.status,'CLOSED');
});

test('자소설 보류는 요청하지 않으며 나머지 정상 수집의 완료 상태를 유지한다', async () => {
  const config=parseConfig({sources:[{id:'wanted',enabled:true,allowRobots403:true,startUrls:[wantedList]},{id:'jasoseol',enabled:false,disabledReason:'DEFERRED',startUrls:['https://jasoseol.com/search']}]});
  assert.equal(config.sources[0].allowRobots403,true);
  const requested=[];
  const run=()=>runCollection(config,{collect:async source=>{requested.push(source.id);return {jobs:[],report:{source:source.id,state:'SUCCESS'}};}});
  const result=await runManualRequest(config,{store:{claimManual:async()=>({runKey:'test'}),touchWorker:async()=>{},heartbeatManual:async()=>{},finishManual:async(_,result)=>result},run});
  assert.deepEqual(requested,['wanted']);
  assert.equal(result.state,'SUCCESS');
  assert.deepEqual(result.reports[1],{source:'jasoseol',state:'DISABLED',reason:'DEFERRED'});
  assert.throws(()=>parseConfig({sources:[{id:'zighang',enabled:true,allowRobots403:true,startUrls:['https://zighang.com/']}]}),/INVALID_CONFIG/);
});
const jobkoreaData = (id, careers) => ({ base: {
  title: 'ERP 및 시스템 유지보수 담당자', post: { postingCompanyName: '테스트 기업', postingStartAt: '2026-10-01T09:00:00+09:00' },
  overview: { recruitment: { workFields: ['ERP 및 시스템 유지보수'], applicationEndAt: '2026-11-01T23:59:59+09:00' } },
  requirement: { careers },
}, extension: { common: { jobId: id } } });

test('잡코리아는 현재 공고의 공개 페이지 데이터에서 필수 경력과 마감을 읽는다', () => {
  const data = jobkoreaData(123, [{ type: 'EXPERIENCED', range: { from: 2, to: null, fromInclusive: true } }]);
  const other = jobkoreaData(456, [{ type: 'EXPERIENCED', range: { from: 10 } }]);
  const [job] = parseJobPage('jobkorea', 'https://www.jobkorea.co.kr/Recruit/GI_Read/123', flight({state:{queries:[{state:{data:other}}, {state:{data}}]}}));
  assert.equal(job.experience, '경력 2년 이상');
  assert.equal(job.company, '테스트 기업');
  assert.equal(job.deadline, '2026-11-01T14:59:59.000Z');
  assert.equal(evaluateJob(job).decision, 'INCLUDE');
});

test('잡코리아 신입 병행 공고와 4년 이상 공고를 구분한다', () => {
  for (const [careers, decision] of [
    [[{type:'NEWBIE'}, {type:'EXPERIENCED',range:{from:4}}], 'INCLUDE'],
    [[{type:'EXPERIENCED',range:{from:4}}], 'EXCLUDE'],
    [[{type:'EXPERIENCED',range:{from:3,fromInclusive:false}}], 'EXCLUDE'],
  ]) {
    const [job] = parseJobPage('jobkorea','https://www.jobkorea.co.kr/Recruit/GI_Read/123',flight(jobkoreaData(123,careers)));
    assert.equal(evaluateJob(job).decision, decision);
  }
});

test('잡코리아 추천 공고의 상세를 현재 공고로 저장하지 않는다', () => {
  assert.throws(()=>parseJobPage('jobkorea','https://www.jobkorea.co.kr/Recruit/GI_Read/123',flight(jobkoreaData(456,[{type:'NEW'}]))),/UNSUPPORTED_PAGE/);
});

test('잡코리아 Flight 텍스트 레코드 뒤의 독립 JSON 청크도 읽는다', () => {
  const html=`<script>self.__next_f.push([1,"0:T3,abc"])</script>`+flight(jobkoreaData(123,[{type:'EXPERIENCED',range:{from:2}}]));
  const [job]=parseJobPage('jobkorea','https://www.jobkorea.co.kr/Recruit/GI_Read/123',html);
  assert.equal(job.experience,'경력 2년 이상');
});

test('사람인 공개 메타 정보만 있는 상세는 요약임을 보존하고 연차를 판정한다', () => {
  const html = `<meta property="og:title" content="[테스트 기업] 백엔드 개발자 채용(D-10) - 사람인">
    <meta name="description" content="테스트 기업, 백엔드 개발자 채용, 경력:경력 2~5년, 학력:대학졸업(2,3년)이상, 면접 후 결정, 마감일:2026-11-01, 홈페이지:example.test">
    <div>로그인</div>`;
  const [job] = parseJobPage('saramin','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123',html);
  assert.equal(job.title,'백엔드 개발자 채용');
  assert.equal(job.company,'테스트 기업');
  assert.equal(job.experience,'경력 2~5년');
  assert.equal(job.education,'대학졸업(2,3년)이상');
  assert.equal(job.deadline,'2026-11-01T14:59:59.000Z');
  assert.equal(job.detailStatus,'UNVERIFIED');
  assert.equal(evaluateJob(job).decision,'INCLUDE');
});

test('잡코리아 검색의 다음 페이지는 현재 검색 조건을 유지한다', () => {
  const base='https://www.jobkorea.co.kr/Search?stext=ERP&Page_No=1';
  const {urls}=discoverLinks('jobkorea',base,`<a href="/Recruit/GI_Read/123">공고</a>
    <a href="/Search?stext=ERP&amp;Page_No=0">이전</a><a href="/Search?stext=ERP&amp;Page_No=2">다음</a>
    <a href="/Search?stext=회계&amp;Page_No=2">다른 검색</a>`, 'text/html');
  assert.deepEqual(urls,['https://www.jobkorea.co.kr/Recruit/GI_Read/123','https://www.jobkorea.co.kr/Search?Page_No=2&stext=ERP']);
});

test('사람인 본문은 현재 공고 영역만 읽고 회사 소개나 추천 공고를 섞지 않는다', () => {
  const html=`<meta property="og:title" content="[회사] 서버 개발자(상시 채용) - 사람인">
    <meta name="description" content="회사, 서버 개발자, 경력:경력 2년 이상, 학력:학력무관, 면접 후 결정, 마감일:상시채용">
    <div class="user_content jobsViewDetail_999">보안 관제 경력 10년</div>
    <div class="user_content jobsViewDetail_123"><div>담당업무</div><div>서버 개발</div><div>자격요건</div><p>경력 2년 이상</p></div>
    <div class="jv_company">회사 설립 20년</div>`;
  const [job]=parseJobPage('saramin','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123',html);
  assert.equal(job.description,'담당업무\n서버 개발\n자격요건\n경력 2년 이상');
  assert.equal(job.detailStatus,'AVAILABLE');
  assert.equal(evaluateJob(job).decision,'INCLUDE');
});

test('사람인 페이지 버튼의 page 값을 검색 URL에 반영한다', () => {
  const base='https://www.saramin.co.kr/zf_user/search/recruit?searchword=ERP&recruitPage=1&recruitSort=reg_dt';
  const {urls}=discoverLinks('saramin',base,`<a href="#recruit_info" page="2" class="page_move">2</a>
    <a href="#company_info" page="2" class="page_move">기업 2</a>`, 'text/html');
  assert.deepEqual(urls,['https://www.saramin.co.kr/zf_user/search/recruit?recruitPage=2&recruitSort=reg_dt&searchword=ERP']);
});

test('비활성 플랫폼은 요청하지 않고 미수집 사유를 보고한다', async () => {
  const config = parseConfig({ sources: [
    { id: 'zighang', enabled: true, startUrls: ['https://zighang.com/seo/sitemap/sitemap-index.xml'] },
    { id: 'wanted', enabled: false, disabledReason: 'HTTP_403', startUrls: ['https://www.wanted.co.kr/wdlist/518'] },
  ] });
  const requested = [];
  const result = await runCollection(config, { collect: async source => {
    requested.push(source.id); return { jobs: [], report: { source: source.id, state: 'SUCCESS' } };
  } });
  assert.deepEqual(requested, ['zighang']);
  assert.deepEqual(result.reports[1], { source: 'wanted', state: 'DISABLED', reason: 'HTTP_403' });
});

test('수집 불가 플랫폼이 있으면 전체 정상 수집으로 표시하지 않는다', async () => {
  const result = await runManualRequest({}, {store:{claimManual:async()=>({runKey:'test'}),touchWorker:async()=>{},heartbeatManual:async()=>{},finishManual:async(_,result)=>result},
    run:async()=>({reports:[{source:'zighang',state:'SUCCESS'},{source:'wanted',state:'DISABLED',reason:'HTTP_403'}]})});
  assert.equal(result.state,'PARTIAL');
});

test('한 플랫폼 접근 실패가 다른 플랫폼의 수집 성공을 전체 실패로 바꾸지 않는다', async () => {
  const result=await runManualRequest({}, {store:{claimManual:async()=>({runKey:'test'}),touchWorker:async()=>{},heartbeatManual:async()=>{},finishManual:async(_,result)=>result},
    run:async()=>({reports:[{source:'jobkorea',state:'SUCCESS',stored:2},{source:'wanted',state:'FAILED',errors:[{code:'ROBOTS_HTTP_403'}]}]})});
  assert.equal(result.state,'PARTIAL');
  assert.equal(result.reports[0].stored,2);
});

test('플랫폼 공개 목록에서 공고 링크를 정규화하고 다른 경로를 따라가지 않는다', () => {
  const cases = [
    ['jobkorea', 'https://www.jobkorea.co.kr/Recruit/joblist', '/Recruit/GI_Read/123?logpath=1', 'https://www.jobkorea.co.kr/Recruit/GI_Read/123'],
    ['saramin', 'https://www.saramin.co.kr/sitemap.xml', '/zf_user/jobs/relay/view?rec_idx=123&utm_source=feed', 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123'],
    ['wanted', 'https://www.wanted.co.kr/wdlist/518', '/wd/123', 'https://www.wanted.co.kr/wd/123'],
    ['jasoseol', 'https://jasoseol.com/recruit', '/recruit/123', 'https://jasoseol.com/recruit/123'],
  ];
  for (const [source, base, href, expected] of cases) {
    assert.deepEqual(discoverLinks(source, base, `<a href="${href}">개발</a><a href="/api/list">내부</a><a href="https://other.test">외부</a>`, 'text/html').urls, [expected]);
    const [job] = parseJobPage(source, expected, `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: '백엔드 개발자', hiringOrganization: {name:'테스트 기업'}, description:'담당업무 서버 개발', experienceRequirements:'경력 2년 이상' })}</script>`);
    assert.equal(job.company, '테스트 기업');
    assert.equal(job.experience, '경력 2년 이상');
  }
});
