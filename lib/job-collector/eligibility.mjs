// 수집과 기존 목록 조회가 공유하는 직군·지원 가능 경력 기준이다. 변경 시 버전을 올린다.
export const ELIGIBILITY_VERSION = 'it-junior-2026-10-05-v2';
const normalize = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
const headers = /(담당\s*업무|주요\s*업무|주요\s*역할|자격\s*요건|지원\s*자격|필수\s*(?:요건|조건|사항)|우대\s*(?:사항|조건)|복리\s*후생|근무\s*(?:환경|조건|시간)|전형\s*절차|지원\s*방법|마감\s*기한|responsibilities|requirements|qualifications|preferred\s+qualifications|nice\s+to\s+have|benefits)/gi;
function sections(body) {
  const parts = normalize(body).split(headers);
  const result = [{ kind: 'general', text: parts[0] }];
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i];
    const kind = /우대|preferred|nice\s+to/i.test(heading) ? 'preferred'
      : /업무|역할|responsibilities/i.test(heading) ? 'work'
      : /요건|자격|필수|requirements|qualifications/i.test(heading) ? 'required' : 'other';
    result.push({ kind, text: parts[i + 1] ?? '' });
  }
  return result;
}

const securityTitle = /보안|정보\s*보호|개인정보\s*보호|모의\s*해킹|침해\s*대응|취약점|\b(?:security|cybersecurity|infosec|devsecops|pentest(?:er)?|soc\s+analyst|ciso)\b/i;
const securityWork = /보안\s*관제|침해\s*사고\s*대응|모의\s*해킹|취약점\s*(?:진단|분석)|정보\s*보호\s*체계|보안\s*(?:장비|솔루션|시스템).{0,20}(?:구축|운영|개발)|\b(?:penetration testing|incident response|security monitoring)\b/i;
const officeTitle = /경리|회계\s*사무|사무\s*(?:직|원|지원|보조)|전산\s*입력|자료\s*입력|리셉션|안내\s*데스크|자재\s*관리|창고\s*관리|견적|물량\s*산출|\b(?:receptionist|data entry|administrative assistant|bookkeep(?:er|ing))\b/i;
const fieldRepair = /(?:노트북|컴퓨터|프린터|\bpc\b).{0,20}(?:수리|a\/?s)|출장.{0,30}(?:수리|복구)|(?:현장\s*(?:출동|방문)|하드디스크|\bhdd\b).{0,40}(?:복구|수리)|(?:복구|수리).{0,40}(?:현장\s*(?:출동|방문)|출장)/i;
const itRole = /백\s*엔드|프론트\s*엔드|풀\s*스택|개발자|프로그래머|(?:소프트웨어|SW|펌웨어|임베디드|앱|웹|게임|시스템|서버).{0,18}(?:개발|운영|관리|엔지니어|QA|테스트)|(?:AI|인공지능|머신러닝|딥러닝|데이터|클라우드|네트워크|인프라).{0,18}(?:개발|분석|과학|연구|엔지니어|운영|관제|설계)|(?:ERP|SAP|MES|CRM|솔루션).{0,18}(?:개발|구축|운영|유지보수|컨설턴트|기술\s*지원)|전산\s*(?:팀|담당|개발|운영|관리)|IT.{0,18}(?:기획|엔지니어|운영|컨설턴트|기술\s*지원|헬프데스크)|(?:디지털|IT|웹|앱|플랫폼|온라인).{0,15}(?:서비스\s*기획|프로덕트\s*매니저|PM|PO)|(?:UI|UX).{0,10}(?:디자인|디자이너|기획)|\b(?:back[- ]?end|front[- ]?end|full[- ]?stack|devops|sre|dba|software engineer|software developer|software tester|software qa|data (?:engineer|analyst|scientist)|(?:ai|ml|machine learning|network|cloud|systems?|support) engineer|it help\s?desk|ux designer|ui designer)\b/i;

const additionalItRole = /웹\s*퍼블리셔|(?:DX|AX|디지털\s*전환).{0,15}(?:기획|개발|엔지니어|컨설턴트)|\b(?:(?:android|ios|mobile|embedded|firmware)\s+(?:developer|engineer)|qa\s+(?:engineer|tester))\b/i;
const isItRole = text => itRole.test(text) || additionalItRole.test(text);

function careerSignal(text, trusted = false) {
  text = normalize(text);
  if (!text) return null;
  // 우대 연수는 필수 경력의 하한으로 올리지 않는다.
  const clauses = text.split(/[;；。\n]|(?<!\d)\.(?!\d)/).filter(part => !/우대|preferred|preferably|nice.to.have/i.test(part));
  const signals = [];
  for (const clause of clauses) {
    const entry = !/신입\s*(?:지원|채용)?\s*(?:불가|제외|불가능)/.test(clause)
      && /신입(?!\s*사원\s*(?:교육|연수))|경력\s*(?:무관|없어도)|\b(?:entry[- ]level|new graduate|no (?:prior )?experience required)\b/i.test(clause);
    const alternativeEntry = entry && /신입\s*(?:[·/ㆍ]|및|또는|혹은|or)\s*경력|경력\s*(?:무관|없어도)|no (?:prior )?experience required/i.test(clause);
    const years = [];
    const pattern = /(\d+(?:\.\d+)?)\s*(?:(?:년(?:차)?|years?)\s*)?(?:[~∼–—-]|to)\s*(\d+(?:\.\d+)?)\s*(?:년(?:차)?|years?)(?!제)|(\d+(?:\.\d+)?)\s*(\+)?\s*(?:년|years?)(?!제)\s*(이상|이하|미만|초과|차|\+)?/gi;
    for (const match of clause.matchAll(pattern)) {
      const context = clause.slice(Math.max(0, match.index - 35), match.index + match[0].length + 35);
      if (/근속|포상|창립|설립|학년|졸업|년제/.test(context)) continue;
      if (!trusted && !/경력|경험|experience/i.test(context)) continue;
      const lower = Number(match[1] ?? match[3]);
      if (lower > 60) continue;
      const strictlyOver = match[5] === '초과' || /(?:more than|greater than|over)\s*$/i.test(clause.slice(0, match.index));
      years.push(match[1] ? lower : /이하|미만/.test(match[5] ?? '') ? 0 : lower + (strictlyOver ? 0.001 : 0));
    }
    if (alternativeEntry) signals.push(0);
    else if (years.length) signals.push(Math.max(...years));
    else if (entry) signals.push(0);
  }
  return signals.length ? Math.max(...signals) : null;
}

export function evaluateJob(job) {
  // 회사명에 보안이 들어가는 일반 개발 공고를 직무와 혼동하지 않는다.
  const title = normalize(job.title).replace(/\[[^\]]*(?:회사|기업)[^\]]*\]/g, '');
  const parts = sections(job.description);
  const workParts = parts.filter(part => part.kind === 'work');
  const work = (workParts.length ? workParts : parts.filter(part => part.kind === 'general')).map(part => part.text).join(' ');
  const result = (decision, reason, minimumYears = null) => ({ version: ELIGIBILITY_VERSION, decision, reason, minimumYears });
  if (securityTitle.test(title) || securityWork.test(work)) return result('EXCLUDE', 'SECURITY_ROLE');
  if (fieldRepair.test(`${title} ${work}`)) return result('EXCLUDE', 'FIELD_REPAIR');
  if (officeTitle.test(title)) return result('EXCLUDE', 'OFFICE_ROLE');
  if (!isItRole(title) && !isItRole(work)) return result('EXCLUDE', 'IT_ROLE_UNCONFIRMED');
  const requirements = parts.filter(part => ['general', 'required'].includes(part.kind));
  const minimums = [careerSignal(job.experience, true), careerSignal(title, true),
    ...requirements.map(part => careerSignal(part.text))].filter(value => value !== null);
  if (!minimums.length) return result('REVIEW', 'EXPERIENCE_UNCONFIRMED');
  const minimumYears = Math.max(...minimums);
  return minimumYears > 3 ? result('EXCLUDE', 'EXPERIENCE_OVER_LIMIT', minimumYears) : result('INCLUDE', 'ELIGIBLE', minimumYears);
}

export function jobEligibility(job) {
  return job.eligibility?.version === ELIGIBILITY_VERSION ? job.eligibility : evaluateJob(job);
}
