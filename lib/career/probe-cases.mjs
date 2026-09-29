// Entirely fictional. Holdout labels were fixed before their first live run.
const jd='기술 문제의 원인을 분석하고, 조치한 뒤 테스트로 결과를 검증하는 업무';
const prompt='본인의 문제 분석, 조치, 검증 결과를 설명하세요.';
const gate=(id,status)=>({kind:'gate',id,status});
const match={kind:'match',id:'r1',status:'MET'};
const baselineFact='API 오류 로그를 분류해 중복 처리가 원인임을 재현했다. 중복 처리 방지를 적용하고 재현 테스트 통과를 확인했다.';
const baselineDraft='API 오류 로그를 분류해 중복 처리가 원인임을 재현했습니다. 중복 처리를 막는 조건을 추가하고 재현 테스트 통과를 확인했습니다.';
const calibration=[
  {id:'cal-grounded',facts:[baselineFact],draft:baselineDraft,expected:[gate('G2','PASS'),match]},
  {id:'cal-invented',facts:[baselineFact],draft:baselineDraft+' 매출 3억 원 증가를 달성했습니다.',expected:[gate('G2','FAIL')]},
  {id:'cal-missing',facts:[],draft:'API 오류율을 절반으로 줄였습니다.',expected:[gate('G2','UNKNOWN')]},
];
const reportFact='보고서 합계가 중복되는 현상을 조사했다. 조인 조건 누락을 작은 SQL 예제로 재현했다. 조건을 추가하고 기대 합계와 조회 결과가 일치하는 회귀 테스트를 확인했다.';
const reportDraft='보고서 합계 중복을 조사하며 조인 조건 누락을 작은 SQL 예제로 재현했습니다.\n\n누락된 조건을 추가하고 기대 합계와 조회 결과가 일치하는 회귀 테스트를 확인했습니다.';
const holdout=[
  {id:'hold-report-grounded',facts:[reportFact],draft:reportDraft,expected:[gate('G2','PASS'),gate('G3','PASS'),match]},
  {id:'hold-invented-savings',facts:[reportFact],draft:reportDraft+' 이를 통해 연간 운영비 8천만 원을 절감했습니다.',expected:[gate('G2','FAIL')]},
  {id:'hold-team-credit',facts:['이미지 캐시 만료 문제는 동료가 분석하고 수정했다. 나는 수정 이후 브라우저별 확인 테스트만 수행했다.'],draft:'제가 이미지 캐시 만료의 원인을 단독 분석하고 수정 코드를 구현했습니다. 이후 브라우저별 테스트로 결과를 확인했습니다.',expected:[gate('G2','FAIL')]},
  {id:'hold-plan-inflation',facts:['파일 업로드 중단 문제를 재현했다. 재개 기능 구현과 테스트는 다음 분기에 진행할 계획이며 아직 시작하지 않았다.'],draft:'파일 업로드 중단 원인을 재현하고 재개 기능 구현과 검증을 완료했습니다.',expected:[gate('G2','FAIL')]},
  {id:'hold-source-missing',facts:[],draft:'알림 중복 발송을 수정하고 실패율을 60% 줄였습니다.',expected:[gate('G2','UNKNOWN')]},
  {id:'hold-answer-omission',facts:[reportFact],draft:'보고서 합계가 중복되는 현상을 SQL 예제로 재현하고 조인 조건을 수정했습니다.',expected:[gate('G1','FAIL'),gate('G2','PASS')]},
  {id:'hold-internal-contradiction',facts:[reportFact],draft:reportDraft+' 당시에는 SQL 예제를 만들지 않았고 회귀 테스트도 수행하지 않았습니다.',expected:[gate('G3','FAIL')]},
  {id:'hold-off-topic',facts:[reportFact],draft:'저는 새벽 산책을 즐깁니다. 공원을 한 바퀴 돌면 기분이 좋아집니다.',expected:[gate('G1','FAIL'),match]},
  {id:'hold-source-conflict',facts:['동일 보고서 개선 프로젝트의 최종 기록 A에는 회귀 테스트를 실행하고 통과했다고 적혀 있다.','동일 프로젝트와 동일 시점의 최종 기록 B에는 회귀 테스트를 작성하거나 실행한 적이 없다고 적혀 있다. 어느 기록이 유효한지 확인되지 않았다.'],draft:'보고서 합계를 수정하고 회귀 테스트 통과를 확인했습니다.',expected:[gate('G2','UNKNOWN')]},
];
export function probeCases(suite){
  if(!['calibration','holdout'].includes(suite))throw new Error('INVALID_PROBE_SUITE');
  return structuredClone(suite==='holdout'?holdout:calibration).map(c=>{
    const sources=c.facts.map((text,i)=>({id:`s${i}`,origin:'USER_PROVIDED',title:'가상 경험',text,documentId:null,revision:null,url:null,verification:'USER_STATEMENT'}));
    const facts=c.facts.map((statement,i)=>({id:`f${i}`,statement,sourceRefs:[{sourceId:`s${i}`,start:0,end:Array.from(statement).length,quote:statement}],actor:'SELF',stage:'COMPLETED',confirmation:'USER_STATED',supersedes:[]}));
    sources.push({id:'sjd',origin:'JD_COPY',title:'가상 JD',text:jd,documentId:null,revision:null,url:null,verification:'USER_STATEMENT'});
    let offset=0;
    const paragraphs=c.draft.split('\n\n').map((text,i)=>{const start=offset,end=start+Array.from(text).length;offset=end+2;return {id:`p${i}`,start,end,role:'경험',factIds:facts.map(f=>f.id),requirementIds:['r1']};});
    return {id:c.id,expected:c.expected,input:{contractVersion:'career-contract/0.1.0',sessionId:null,mode:'DIAGNOSE',sources,facts,
      jd:{sourceIds:['sjd'],completeness:'COMPLETE',requirements:[{id:'r1',kind:'DUTY',priority:'REQUIRED',text:jd,sourceRef:{sourceId:'sjd',start:0,end:Array.from(jd).length,quote:jd}}],eligibilityLogic:null},
      questions:[{id:'q1',prompt,requiredElements:[{id:'e1',text:'검증 결과',quote:'검증 결과'}],relevantRequirementIds:['r1'],lengthRule:null,formatInstructions:[]}],
      answers:[{questionId:'q1',text:c.draft,paragraphs}],styleReferenceSourceIds:[],editScope:{questionIds:['q1'],paragraphIds:[],allowRestructure:false,preserveExact:[],forbiddenClaims:[]},baseDocument:null}};
  });
}
