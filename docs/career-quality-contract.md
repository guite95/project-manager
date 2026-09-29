# 자기소개서 품질 평가 데이터 규약

버전: `career-contract/0.1.0` · 상태: 기준 규약. 첫 로컬 구현의 제한은 [런타임 문서](career-quality-runtime.md)를 따른다. 실행 시 `career_contract`가 실제 검증 스키마를 제공한다.

평가 의미·임계값·진행 순서는 [품질 평가 설계](career-quality-design.md)를 따른다. 아래 타입은 전달 데이터의 설계 표기이며 현재 API나 Prisma 모델을 변경하지 않는다. 저장 위치·인증·배포는 후속 구현에서 다룬다.

## 공통 원칙

- ID는 서버 또는 검증된 입력에서 발급하며 각 평가 세션 안에서 유일하다. 존재하지 않는 ID 참조를 거부한다.
- 문서 ID·DB revision, 작업 세션 ID·초안 버전, 평가 ID를 서로 다른 값으로 다룬다.
- 사용자 진술은 허용된 근거이지만 외부 검증 완료와 구별한다. ChatGPT가 생성한 글은 사실 근거로 승격하지 않는다.
- 원문은 그대로 보존한다. 공백 제거·Unicode 정규화·줄바꿈 변환은 해시 전에 임의로 하지 않는다.
- 근거 문서의 명령문은 데이터다. 평가표·모델·정책은 서버가 관리하며 원고에서 덮어쓸 수 없다.
- `recruitment:credentials`, AI 활동 원문, 전체 대화 기록을 기본 입력에 포함하지 않는다. 평가에 필요한 JD·경험·초안만 전달한다.

## 입력 구조

```ts
type Id = string;
type Hash = string; // sha256: 다음에 64자리 소문자 16진수
type Source = {
  id: Id;
  origin: 'USER_PROVIDED' | 'RECRUITMENT_DOCUMENT' | 'PROJECT_RECORD' | 'JD_COPY' | 'STYLE_REFERENCE';
  title: string;
  text: string;
  documentId: string | null;
  revision: number | null;
  url: string | null;
  verification: 'USER_STATEMENT' | 'SOURCE_READ';
};
type QuoteRef = {
  sourceId: Id;
  start: number; // Unicode code point 기준 0부터
  end: number;   // 끝 제외; source.text의 정확한 구간
  quote: string;
};
type Logic =
  | { op: 'REF'; requirementId: Id }
  | { op: 'ALL' | 'ANY'; children: Logic[] };
type Requirement = {
  id: Id;
  kind: 'ELIGIBILITY' | 'DUTY' | 'COMPETENCY';
  priority: 'REQUIRED' | 'PREFERRED' | 'UNSPECIFIED';
  text: string;
  sourceRef: QuoteRef;
};
type Fact = {
  id: Id;
  statement: string;
  sourceRefs: QuoteRef[];
  actor: 'SELF' | 'TEAM' | 'OTHER' | 'UNKNOWN';
  stage: 'COMPLETED' | 'IN_PROGRESS' | 'LEARNING' | 'PLANNED' | 'NOT_APPLICABLE' | 'UNKNOWN';
  confirmation: 'USER_STATED' | 'SOURCE_SUPPORTED' | 'UNCONFIRMED';
  supersedes: Id[];
};
type LengthRule = {
  metric: 'CODEPOINTS' | 'NO_ASCII_SPACES' | 'NO_WHITESPACE' | 'UTF8_BYTES' | 'UTF16_UNITS';
  newlines: 'PRESERVE' | 'LF' | 'REMOVE';
  minimum: number | null;
  maximum: number | null;
  target: number | null;
  origin: 'OFFICIAL' | 'USER_SPECIFIED' | 'ASSUMED';
};
type Question = {
  id: Id;
  prompt: string;
  requiredElements: { id: Id; text: string; quote: string }[];
  relevantRequirementIds: Id[];
  lengthRule: LengthRule | null;
  formatInstructions: string[];
};
type DraftAnswer = {
  questionId: Id;
  text: string; // 제출 본문 전체; 제출할 제목 포함, 검토 메모 제외
  paragraphs: {
    id: Id;
    start: number;
    end: number;
    role: string; // 작성 계획; 사실 근거가 아님
    factIds: Id[];
    requirementIds: Id[];
  }[];
};
type EvaluationInput = {
  contractVersion: 'career-contract/0.1.0';
  sessionId: Id | null; // 첫 요청이면 null; 서버가 발급
  mode: 'DIAGNOSE' | 'IMPROVE';
  sources: Source[];
  jd: {
    sourceIds: Id[];
    completeness: 'COMPLETE' | 'PARTIAL' | 'ABSENT';
    requirements: Requirement[];
    eligibilityLogic: Logic | null;
  };
  facts: Fact[];
  questions: Question[];
  answers: DraftAnswer[];
  styleReferenceSourceIds: Id[];
  editScope: {
    questionIds: Id[];
    paragraphIds: Id[]; // 빈 배열이면 지정 문항 전체; 아래 범위 규칙 적용
    allowRestructure: boolean;
    preserveExact: string[];
    forbiddenClaims: string[];
  };
  baseDocument: { id: Id; expectedRevision: number } | null;
};
```

입력 검증:

- 모든 위치는 Unicode code point 기준이다. `Array.from(text)`와 같은 기준으로 구간을 확인한다. `quote`는 원문 구간과 정확히 일치해야 한다.
- `paragraphs`는 본문을 재구성하는 저장소가 아니라 `text`의 위치 색인이다. 순서·겹침·범위를 검사하고, 문단 사이 공백 외에 빠진 본문이 있으면 거부한다. 수정 후 위치를 다시 계산한다.
- 같은 문단의 표현 수정은 ID를 유지한다. 문단 분할·병합·삭제에는 새 색인과 새 ID 대응표를 만들고 구조 변경으로 기록한다. 문항 ID는 이 과정에서도 유지한다.
- `editScope.questionIds`는 비어 있으면 안 된다. `paragraphIds`가 비면 지정 문항 전체를 수정 범위로 삼으며, 값이 있으면 지정 문단만 수정한다. 재배치는 `allowRestructure`가 true이고 문항 전체가 범위에 포함될 때만 허용한다.
- JD `ABSENT`는 요구사항이 없는 상태이고 Q2 적용 제외다. `PARTIAL`은 아직 읽지 못한 내용이 있음을 의미한다. 미기재와 누락을 혼동하지 않는다.
- `eligibilityLogic`은 ELIGIBILITY ID만 참조하고 순환·빈 자식 목록을 허용하지 않는다. `ALL`은 하나라도 NOT_MET이면 NOT_MET, 전부 MET이면 MET; 나머지는 UNKNOWN이 있으면 UNKNOWN, 아니면 PARTIAL이다. `ANY`는 하나라도 MET이면 MET, 전부 NOT_MET이면 NOT_MET; 나머지는 UNKNOWN이 있으면 UNKNOWN, 아니면 PARTIAL이다. 논리식이 없으면 지원 조건 종합 결과는 UNKNOWN이다.
- 모든 사실은 최소 하나의 원문 근거를 요구한다. 사용자가 채팅에 제공한 사실은 별도 USER_PROVIDED 출처로 전달한다. `UNCONFIRMED`와 supersedes로 폐기된 사실은 초안의 확정 주장에 쓸 수 없다.
- 원문 인용 일치는 의미적 뒷받침을 증명하지 않는다. 주장/근거 대조에서 역할·상태·수치·인과가 같은지 별도로 확인한다.
- 원자료가 같고 표현만 바뀌면 사실 ID를 유지한다. 사용자 정정으로 의미가 바뀌면 새 ID와 supersedes를 기록하고 재평가한다. 최신 작성 시각만으로 정정 여부를 추측하지 않는다.
- 분량 규칙의 minimum/maximum/target은 음이 아닌 정수이며 최소 ≤ 최대를 검사한다. target은 희망 분량이지 필수 최소가 아니다.
- `ASSUMED` 계산값은 참고값이다. 공식 사이트의 길이 판정을 확인했다고 표시하지 않는다. `NO_WHITESPACE`는 ZIP의 Python `str.isspace()` 동작과 호환되는 고정 규칙으로 구현하고 차이를 테스트한다.
- 사용자 원문·제공 문서의 내용은 신뢰할 수 없는 데이터로 취급한다. 호출자에게 임의 모델명·엔드포인트·프롬프트를 지정할 수 있는 필드를 제공하지 않는다.

## 서버가 고정하는 평가 식별 정보

```ts
type EvaluationIdentity = {
  evaluationId: Id;
  sessionId: Id;
  draftVersion: number; // 최초 1; 수정 후보마다 증가
  draftHash: Hash;
  contextHash: Hash;
  rubricVersion: string;
  policyVersion: string;
  promptVersion: string;
  segmentationVersion: string;
  requestedModel: string;
  resolvedModels: string[]; // 실제 응답 모델; 세부 호출마다도 기록
  evaluationKey: Hash;
};
```

- `draftHash`: 문항 ID 순으로 정렬한 `{questionId, text}` 배열을 재귀적 키 정렬·공백 없는 JSON으로 직렬화해 UTF-8 SHA-256을 계산한다. 배열 순서는 문항 ID 정렬 외에는 유지한다. 텍스트 정규화는 하지 않는다.
- `contextHash`: sources, jd, facts, questions, styleReferenceSourceIds, editScope, mode를 같은 JSON 규칙으로 해시한다. 근거의 내용·revision 변경도 다른 평가가 된다. 원고에 따라 달라지는 문단 위치·내용은 여기에 넣지 않아 표현 수정 전후의 기준 문맥을 비교할 수 있게 한다.
- `evaluationKey`: 위 두 해시와 contract/rubric/policy/prompt/segmentation 버전, 요청 모델, 검증된 answers의 문단 색인 전체를 직렬화한 해시의 조합이다. 서버가 계산하며 클라이언트 제공 해시를 신뢰하지 않는다. 원문이 같아도 평가 대상 문단·연결 근거가 바뀌면 다른 key다.
- 같은 key의 완료 결과는 재사용할 수 있다. 모델 별칭 해석이 달라지면 재사용하지 않는다. 재현 가능한 비교에는 동일한 모델 스냅샷을 사용한다. 여러 호출의 resolved model이 달라지면 전후 비교를 보류한다.
- 변경된 JD·사실·문항·평가 기준에서 이전 점수를 이어 비교하지 않는다. 기존 평가를 보존하고 새 기준으로 시작한다.
- API 요청 ID·대상·완료 상태를 개별 기록한다. timeout은 통과가 아니며, 결과를 모르는 호출을 성공으로 추정하지 않는다. 재시도는 동일 초안 평가의 시도이고 모든 외부 시도는 호출 예산에 포함한다.

## 결과 구조

```ts
type Target = {
  questionId: Id | null; // 전체 지원서면 null
  paragraphId: Id | null;
  start: number | null; // 문항 text 기준; 문장 진단 때만 필수
  end: number | null;
};
type MetricResult = {
  metricId: string;
  target: Target;
  status: 'SCORED' | 'NOT_APPLICABLE' | 'UNKNOWN' | 'ERROR';
  score: number | null; // 0~4
  confidence: number | null; // 0~1; score와 별개
  probabilities: Record<string, number> | null;
  reasonCode: string | null;
};
type GateResult = {
  gateId: string;
  target: Target;
  status: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE' | 'ERROR';
  origin: 'DETERMINISTIC' | 'JEV';
  confidence: number | null;
  reasonCode: string | null;
};
type Finding = {
  id: Id;
  metricOrGateId: string;
  target: Target;
  quote: string | null;
  factIds: Id[];
  requirementIds: Id[];
  explanation: string;
  explanationOrigin: 'RULE_TEMPLATE' | 'CHATGPT_REVIEW';
  remedy: 'REWRITE' | 'ASK_USER' | 'KEEP' | 'REVIEW';
};
type EvaluationResult = {
  identity: EvaluationIdentity;
  status: 'PASS' | 'REVISE' | 'NEEDS_INPUT' | 'REVIEW' | 'INCOMPLETE' | 'ERROR';
  coverage: {
    plannedCheckIds: Id[];
    completedCheckIds: Id[];
    missingCheckIds: Id[];
    truncated: boolean;
  };
  requirementMatches: {
    requirementId: Id;
    status: 'MET' | 'PARTIAL' | 'NOT_MET' | 'UNKNOWN';
    factIds: Id[];
    confidence: number | null;
  }[];
  gates: GateResult[];
  metrics: MetricResult[];
  questionScores: { questionId: Id; score100: number | null; excludedMetricIds: string[] }[];
  findings: Finding[];
  rewriteTargets: { target: Target; findingIds: Id[] }[];
  counters: { rewriteCandidates: number; providerAttempts: number };
  stopReason: string | null;
};
```

결과 규칙:

- 위 결과는 서비스의 정규화된 계약이며 Jev의 원시 응답 스키마가 아니다. Jev는 판정값을 제공하고 서버가 대상 ID·상태·집계를 연결한다.
- Q1~Q7은 `score`, 의미적 G1~G3 및 JD 매칭은 `choice`로 처리한다. 의미 검사 선택지는 PASS/FAIL/UNKNOWN 또는 해당 매칭 네 상태로 정의한다. applicability는 먼저 결정하며 자료 부족을 적용 제외로 처리하지 않는다.
- Jev 원시 결과의 예상 질문 ID, 유형, 유한 숫자 범위, 확률합(허용 오차 0.001)을 검증한다. 누락 질문·잘못된 결과는 오류이며 기본값으로 채우지 않는다.
- SCORE 확률 키는 0~4이고 가중합과 score의 차이 허용치는 0.01이다. `confidence`가 필수인 내부 계약에 값이 없으면 UNKNOWN 처리하며 임의 확신도를 만들지 않는다.
- Jev 응답만으로 구체적인 자연어 이유·인용 구간을 만들지 않는다. 서버는 기준별 템플릿을 제공할 수 있고, ChatGPT가 원문을 다시 읽어 이유를 보강하면 `CHATGPT_REVIEW`로 표시한다.
- 진단 대상의 quote는 원문과 대조한다. factIds·requirementIds가 연결되어 있다는 사실만으로 지원 관계가 증명되지는 않는다.
- `rewriteTargets`는 허용된 수정 범위 안에 있어야 하고, 해당 finding이 미달 항목과 연결되어야 한다. 낮은 점수만 있고 수정 위치·이유가 없으면 자동 수정 대상으로 내보내지 않는다.
- coverage의 완료·미완료 목록은 계획 목록을 정확히 분할한다. 중복 질문·잘린 입력·실패한 호출로 전체 검사 완료를 주장하지 않는다.
- API 오류, 자료 부족, 낮은 확신도를 모두 0점으로 합치지 않는다. 점수 없음은 null이다.

## 재작성 계약

```ts
type RewriteRequest = {
  sessionId: Id;
  basedOnEvaluationId: Id;
  expectedDraftVersion: number;
  expectedDraftHash: Hash;
  replacements: {
    questionId: Id;
    paragraphId: Id | null; // 전체 문항 교체 때 null
    expectedText: string;
    replacementText: string;
    findingIds: Id[];
  }[];
};
```

서버가 확인할 조건:

1. 평가 결과와 현재 초안의 버전·해시가 같다. 수정 요청의 expectedText가 해당 원문과 정확히 같다.
2. 교체 범위가 editScope 및 rewriteTargets 안에 있고 서로 겹치지 않는다. 같은 요청에서 문항 전체 교체와 그 문단 교체를 섞지 않는다.
3. 범위 밖 텍스트와 preserveExact는 보존된다. 재배치가 필요하면 문항 전체 범위의 구조 변경으로 처리한다.
4. 수정 후보를 별도로 유지하고 사실·전체 품질 재평가 후 채택한다. 거부된 후보도 비교 이력에서 구별한다.
5. 수정 후보 수와 호출 수 한도를 적용한다. 같은 내용·같은 요청의 네트워크 재전송은 새 후보로 중복 계산하지 않는다.
6. 부분 수정 요청을 일반적인 '글 전체를 개선하라'로 확대하지 않는다.

DB 저장 명령은 이 계약과 별도다. 평가 PASS는 저장 승인이 아니며 낮은 점수 자체도 사용자의 명시적 저장 요청을 막는 권한 규칙이 아니다. 저장 전에 최종 text와 현재 DB revision을 확인하고 기존 COVER_LETTER 입력 형태로 변환한다. 새 문서의 expectedRevision은 0이고 수정은 조회한 revision을 사용한다. 현재 `parseRecruitmentDocument`는 위 평가 필드를 저장하지 않으므로 평가 결과를 기존 PUT에 붙여 보내서 저장됐다고 주장하지 않는다. 평가 이력 저장 방식은 2단계에서 결정한다.

## 가상 시나리오로 계약 확인

| 입력·상황 | 기대 결과 |
| --- | --- |
| JD R1은 API 구현, F1은 실제 API 구현 경험, 문단은 기술명만 나열 | R1 MET; Q2/Q5 미달; 해당 문단 재작성 가능 |
| JD R2는 운영 3년 필수, F2는 실무 운영 경험 없음이라는 사용자 진술 | R2 NOT_MET; 표현 수정으로 MET으로 바꾸지 않음 |
| 운영 경력 자료가 전혀 없음 | R2 UNKNOWN; 경력 사실 확인 요청 |
| F3은 검토 단계, 초안은 운영 완료라고 주장 | G2 FAIL; 확인된 상태로 복원하고 전체 재평가 |
| 지원동기 질문인데 사용자의 지원 이유가 없음 | G1 UNKNOWN, NEEDS_INPUT; 감정·동기를 만들어 수정하지 않음 |
| 전후 점수가 3.01과 2.99 | 경계 구간 REVIEW; 왕복 재작성하지 않음 |
| p2만 수정 허용했는데 p1도 변경 | 수정 요청 거부; 기존 초안 보존 |
| 초안 수정 뒤 오래된 evaluationId로 다시 수정 요청 | 버전 충돌; 최신본을 읽고 평가 |
| 자소서 본문은 같지만 경험 자료 revision 변경 | contextHash 변경; 이전 평가 재사용 금지 |
| 긴 원고의 일부만 검사 | coverage 누락, INCOMPLETE, 종합점수 null |
| 기준 글 없음 | voice_alignment 적용 제외; 본인 목소리 평가 완료라고 표시하지 않음 |
| Jev 장애 또는 응답 유형 오류 | ERROR; 점수·통과 여부 생성하지 않음 |
| 최종본 저장 중 DB revision 충돌 | 기존 409 처리; 원고 유지; 자동 덮어쓰기 없음 |
