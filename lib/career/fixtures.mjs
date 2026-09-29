export function fixture() {
  const text = '팀에서 API 오류를 분석했습니다.';
  return {
    contractVersion: 'career-contract/0.1.0', sessionId: null, mode: 'IMPROVE',
    sources: [{id:'s1',origin:'USER_PROVIDED',title:'경험',text,documentId:null,revision:null,url:null,verification:'USER_STATEMENT'}],
    jd: {sourceIds:[],completeness:'ABSENT',requirements:[],eligibilityLogic:null},
    facts: [{id:'f1',statement:text,sourceRefs:[{sourceId:'s1',start:0,end:Array.from(text).length,quote:text}],actor:'SELF',stage:'COMPLETED',confirmation:'USER_STATED',supersedes:[]}],
    questions: [{id:'q1',prompt:'문제를 해결한 경험은?',requiredElements:[],relevantRequirementIds:[],lengthRule:null,formatInstructions:[]}],
    answers: [{questionId:'q1',text,paragraphs:[{id:'p1',start:0,end:Array.from(text).length,role:'행동',factIds:['f1'],requirementIds:[]}]}],
    styleReferenceSourceIds:[],editScope:{questionIds:['q1'],paragraphIds:[],allowRestructure:false,preserveExact:[],forbiddenClaims:[]},baseDocument:null,
  };
}
export function decisions(questions, score=4) {
  return {id:'test-request',model:'typesafe/jev-1.13-20260917',usage:{input_tokens:300,output_tokens:100,cost:0.001},answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,q.type==='score'
    ? {type:'score',score,probabilities:{0:0,1:0,2:0,3:0,4:0,[score]:1},confidence:1}
    : {type:'choice',choice:Object.hasOwn(q.criteria,'AVAILABLE')?'AVAILABLE':Object.hasOwn(q.criteria,'PASS')?'PASS':'MET',probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===(Object.hasOwn(q.criteria,'AVAILABLE')?'AVAILABLE':Object.hasOwn(q.criteria,'PASS')?'PASS':'MET')?1:0])),confidence:1}]))};
}
