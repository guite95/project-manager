# 개인 지원 현황과 MCP

`/recruitment`는 `/recruitment/applications`로 이동한다. OWNER는 지원 건마다 회사·직무,
내 진행 상태·우선순위·마감·다음 할 일·제외 사유·메모를 관리하고 공고·경험·자소서·포트폴리오·
개인 할 일을 연결할 수 있다. 공고 상세의 지원 건 만들기는 회사·직무·공고 ID만 제안하며
저장 전까지 DB를 변경하지 않는다. 모집 중/마감과 내 지원 진행 상태는 별개다.

마감은 시간대가 포함된 ISO 날짜/시각이다. 웹 입력은 한국 시간이며 날짜와 시각을 함께
입력하거나 함께 비운다. 수집된 날짜로 정확한 마감 시각을 추측하지 않는다.
연결 자료는 ID로 참조하고 본문을 복제하지 않는다. 문서 링크는 기존 편집 화면의 `?id=`로
해당 자료를 열며, 삭제된 자료는 누락 연결로 표시한다. 목록에는 문서 본문·지원 메모가 없다.

## 저장과 권한

신규 테이블·마이그레이션 없이 기존 `app_setting`과 `issue`/`issue_schedule`/`completion`을 사용한다.

| 키 | 내용 |
| --- | --- |
| `recruitment:application:<id>` | 지원 건 현재 상태와 revision |
| `recruitment:application-history:<id>:<revision>` | 지원 건 버전과 작업 종류 |
| `recruitment:application-request:<sha256>` | OWNER와 requestId에 연결된 요청 해시·동일 응답 |
| `recruitment:private-task:<issueId>` | 개인 태스크의 최초 지원 건 분류 |
| `recruitment:draft-history:<documentId>:<revision>` | 새 초안 저장 경로에서 확인·저장한 문서 버전 |

웹 API 자체에서 DB로 검증된 OWNER를 요구한다. 쓰기는 같은 출처 JSON만 받고, MCP는 기존
OAuth의 scope·OWNER·epoch·grant 만료 검사를 유지한다. 모든 지원 쓰기는 OWNER 행 잠금과
트랜잭션 안에서 권한을 다시 확인한다. 지원 revision·기존 JSON 전체를 비교하고, 태스크는
내용·완료·배치·일정 버전 해시까지 비교한다. 초안은 문서 revision도 함께 확인한다.
충돌은 409이며 부분 저장하지 않는다.

쓰기에는 16~100자 requestId가 필요하다. 동일 OWNER의 같은 requestId와 같은 입력을 재시도하면
처음의 응답을 그대로 반환한다. 입력이 달라지면 새 requestId를 사용해야 하며 기존 ID를
재사용하면 409다. 네트워크 오류 직후에는 원래 ID와 입력을 유지한다. 재시도 응답은 당시
스냅샷이므로 다른 변경까지 확인하려면 상세를 다시 읽는다.

태스크는 `__personal_issues__` 원본을 재사용한다. 개인 할 일에 표시되어 오늘 목록·간트와
완료 이력에 반영된다. 지원 건에 연결한 태스크는 연결을 해제해도 개인 분류를 유지하며,
다른 지원 건으로 재배정하거나 회사/프로젝트 영역으로 이동할 수 없다. 완료된 태스크는
이월 때 삭제하지 않고 archive로 보존한다. 프로젝트 CLI의 today/tasks 조회는 개인 할 일을
제외한다. 보드의 일괄 프로젝트 이동과 연결 분류 쓰기는 테이블/행 잠금 순서로 보호한다.

지원 건 복원은 과거 지원 필드·연결을 새 revision으로 저장한다. 연결된 문서·태스크 본문을
과거 상태로 되돌리지 않는다. 과거 버전의 연결 자료가 사라졌으면 복원을 거부한다.
이 경우 현재 지원 건에서 유효한 자료를 다시 선택해 저장한다.
초안 이력은 이번 MCP 저장 경로에서 본 버전만 보관하며 기존 문서 편집기의 모든 버전을
소급 수집하지 않는다. 문항별 글자 수·제출본 잠금·회사별 공개 포트폴리오·자동 알림은 후속 범위다.

## HTTP와 MCP

웹 API는 `/api/recruitment/applications` 목록, `/<id>` 상세·PUT,
`/tasks?applicationId=<id>` 개인 태스크 후보, `/<id>/tasks` POST,
`/<id>/history` 목록, `/<id>/restore` POST다. 읽기는 no-store이고 데이터를 생성하지 않는다.
태스크 후보는 아직 연결하지 않았거나 지정한 지원 건에 속한 태스크만 반환한다.
신규 지원 건을 작성할 때 사용할 UUID도 후보 필터로 받을 수 있다.

기존 `/mcp/career`에 다음 도구를 추가한다. 에이전트용 개인 CLI는 추가하지 않는다.

| 도구 | 기능 |
| --- | --- |
| `career_list_applications`, `career_get_application` | 지원 목록·상세 조회 |
| `career_save_application` | 지원 생성·편집, 자료 연결 |
| `career_list_application_history`, `career_restore_application` | 지원 이력·복원 |
| `career_list_jobs`, `career_get_job` | 수집 공고 검색·원문 조회 |
| `career_list_application_tasks`, `career_save_application_task` | 개인 할 일 조회·생성·편집·일정·완료 |
| `career_save_application_draft` | 에이전트가 작성한 자소서 초안 저장과 지원 건 연결 |

저장 도구는 `career:read`와 `career:write`, `confirmed: true`를 요구한다. 에이전트는 사용자가
요청한 저장 범위에서 설정하고 필요 없는 재확인 절차를 추가하지 않는다. 초안 본문은 호출한
에이전트가 작성한다. 이 도구 자체는 별도 LLM/Jev 유료 호출이나 외부 지원서 제출을 하지 않는다.
기존 Jev 평가 도구는 별도이며 유지된다. 전체 인자는 [MCP 지침](../plugins/career-application-toolkit/references/career-mcp.md)을 참고한다.

## 적용과 검증

기존 `issue_schedule` 및 Career OAuth 스키마가 적용된 환경을 전제로 한다. 이번 변경은
스키마·운영 데이터·기존 자소서·공개 포트폴리오를 자동 변경하지 않는다. 코드 배포와 OAuth
환경 설정, Hermes 로그인을 각각 수행해야 실제 에이전트가 새 도구를 사용할 수 있다.
기존 ChatGPT 연결을 유지하는 추가 public client 설정과 격리된 Hermes 컨테이너의 수동
callback 전달 절차는 [Career OAuth](career-oauth.md)를 따른다. 설정에 개인 자료나 토큰을
커밋하지 않는다.

로컬 검증은 `lib/recruitment-applications.test.mjs`,
`lib/server/recruitment-applications-{store,http}.test.mjs`, 기존 보드·일정·채용·MCP·OAuth 테스트,
`pnpm typecheck`, `pnpm build`로 진행한다. DB 테스트는 보호된 로컬
`localhost:5432/project_management_test`에서 파일 간 순차 실행한다.
운영 DB 확인·실제 OAuth 로그인·브라우저 검증·배포 상태는 코드 검증과 별도로 보고한다.
