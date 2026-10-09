# 개인 지원 현황과 MCP

사용자는 프로젝트를 개인 업무의 원본 저장소로 사용하고 Hermes가 MCP로 자료를 읽고 수정하기를 원한다. 개인 지원 기능은 웹과 MCP에만 제공하고 CLI에 추가하지 않는다. 이번 단계는 지원 건, 기존 자료 및 할 일 연결, 안전한 MCP 쓰기와 Hermes용 인증 준비까지다. 문항별 제출본 편집기·회사별 공개 포트폴리오·수집기 개선·자동 알림은 이후 단계다.

## 사용자 흐름

채용 메뉴 첫 화면 `/recruitment/applications`에서 회사·직무·마감·진행 상태·우선순위·다음 할 일을 본다. 지원 건 상세에 기존 공고, 경험, 자소서, 포트폴리오 및 할 일을 연결한다. 모집 상태와 내 지원 상태는 독립적이다. 제외 시 사유가 필수이며 수집된 공고를 삭제하지 않는다. 마감 시각은 명시적 시간대가 포함된 값만 저장하고 원문 날짜를 임의의 시각으로 보충하지 않는다.

기존 개인 할 일을 연결하거나 지원 건에서 새로 만든다. 시작일·마감일, 완료 여부 및 오늘/풀 배치는 기존 `issue`, `issue_schedule`, `completion`을 사용한다. 지원용 할 일은 기존 개인 이슈 영역에 한정한다. 연결을 해제해도 개인 자료 분류를 유지하며 CLI·관리자 노출이나 회사 프로젝트 이동을 허용하지 않는다. 완료한 연결 이슈는 이월 시 보관한다.

## 저장과 보안

- 신규 테이블 없이 `app_setting`에 지원 건, 변경 스냅샷, 요청 중복 방지 레코드와 개인 태스크 표시를 저장한다.
- OWNER만 읽고 쓴다. 웹 쓰기는 세션과 same-origin JSON, MCP는 OAuth scope와 현재 OWNER/epoch/만료를 확인한다. 저장 트랜잭션은 OWNER 행을 잠그고 신원을 다시 확인한다.
- 지원 건 ID와 requestId는 호출자가 고정한다. 같은 requestId의 동일 요청은 이전 결과를 돌려주고 다른 내용 재사용은 충돌이다. stale revision 및 task version은 409이며 부분 저장하지 않는다.
- 목록은 메모·문서 본문·자격 정보를 제외한다. 연결된 문서는 ID와 종류를 검증하며 개인 원본을 공개 스냅샷에 복사하지 않는다.
- 지원 건 변경 이력을 보존하고 복원은 기존 이력을 덮지 않는 새 revision으로 저장한다.
- 개인 지원 데이터를 읽거나 저장하는 CLI를 추가하지 않는다. 기존 pm-flow의 today/tasks 조회에서 개인 이슈를 제외한다.
- 기존 ChatGPT OAuth는 유지한다. Hermes 호환성을 공식 문서/소스에서 확인한 뒤 명시적으로 등록한 추가 클라이언트만 지원한다. DCR, wildcard callback, 새 장기 API 키는 추가하지 않는다.

## 구현 계약

타입의 기준은 `lib/recruitment-applications.ts`다. GET 목록은 `ApplicationSummary[]`, GET 상세는 `ApplicationDetail`이다. PUT은 `{application, expectedRevision, requestId}`로 저장하고 상세를 반환한다. GET `/api/recruitment/applications/tasks`는 연결할 수 있는 개인 태스크 목록을 반환한다. POST `/:id/tasks`는 `{task, expectedRevision, requestId}`, GET `/:id/history`는 이력 요약, POST `/:id/restore`는 `{revision, expectedRevision, requestId}`다. 웹과 MCP는 동일 store 함수를 사용한다.

MCP는 지원 건 목록/상세/저장/이력/복원, 공고 목록/단건, 지원 태스크 저장, 미평가 자소서 초안 저장을 제공한다. 기존 평가 기반 저장은 보존한다. 새 초안 저장은 명시적으로 선택한 지원 건에 연결하고 기존 문서 revision을 확인한다. 자동 외부 제출·공개·삭제 도구는 없다.

## 검증과 운영

무인증·ADMIN 거부, 리비전 경쟁, 멱등성, 연결 무결성, 태스크 회사 이동 금지·CLI 제외·이월 보존, OAuth 클라이언트 혼합 공격을 테스트한다. 테스트는 로컬 `localhost:5432/project_management_test`만 사용한다. 공통 UI 컴포넌트와 네이비 구조를 재사용하고 브라우저 검증은 수행하지 않는다. 커밋·푸시·운영 데이터 변경·배포·실제 Hermes 로그인은 이번 코드 구현 완료와 구분한다.
