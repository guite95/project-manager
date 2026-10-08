# 프로젝트별 TODO와 일정

할 일(`/today`)에서 **목록 / 간트**를 전환한다. 기존 프로젝트 이슈 하나에 시작일·마감일을 붙이며,
별도 TODO 사본은 생성하지 않는다. 간트에서도 할 일을 추가하고 완료/완료 취소할 수 있다.

- 프로젝트·완료 상태·제목으로 필터링하고, 주·월 단위 및 기준일로 조회 기간을 바꾼다.
- 프로젝트 요약 막대는 소속 일정의 전체 기간이다. 프로젝트를 펼치면 개별 항목이 나타난다.
  초기에는 모두 접으며 하나만 펼친다. 막대나 제목을 누르면 기간을 수정한다.
- 시작일과 마감일은 한국 업무일 기준 `YYYY-MM-DD`이고 양 끝 날짜를 포함한다.
  마감일이 시작일보다 빠르거나 한 날짜만 입력한 요청은 거부한다.
- 두 날짜를 비우면 일정 미지정으로 돌아간다. 기존 이슈·제목·프로젝트·완료 이력은 유지한다.
- 기간이 없는 이슈는 **일정 미지정**에 표시한다. 기존 이슈의 기간을 자동 추정하거나 채우지 않는다.
- `show_in_tasks=false`인 등록 프로젝트는 미분류로 보내지 않고 간트에서도 숨긴다.
  OWNER/ADMIN의 기존 할 일 권한을 그대로 사용하며 ADMIN에게 개인 이슈를 공개하지 않는다.

## 저장과 동시 수정

`issue_schedule`은 `issue`와 1:1로 연결된다. `start_date`, `end_date`, `revision`만 저장하며
제목·프로젝트·완료 상태는 원본 `issue`를 읽는다. 새 이슈와 일정은 하나의 트랜잭션으로 생성한다.

- `GET /api/board?view=gantt`는 현재 이슈와 보관된 완료 이슈를 조회한다. GET은 이월·시딩·쓰기 없이 동작한다.
- 기존 `POST /api/issues`는 선택적 `schedule: {startDate, endDate, revision: 0}`을 받는다.
- `PATCH /api/issues/[id]`는 `schedule: {startDate, endDate, revision}`을 받는다.
  일정 변경은 다른 필드와 한 요청으로 섞을 수 없고 같은 출처의 JSON 요청만 허용한다.
- 이슈 행 잠금 후 revision을 검사해 충돌 시 409를 반환한다. 화면은 편집 중 날짜를 유지하며
  사용자가 최신 일정을 다시 열 수 있다. 기간을 지워도 revision 행은 남아 오래된 요청이 덮어쓰지 못한다.
- 완료 처리는 기존 `done`과 `completion`을 함께 변경한다. 같은 상태의 재요청은 완료 이력을 중복 생성하지 않는다.
  일정이 있는 풀 항목을 완료하면 `placement=archive`로 보관한다. 완료를 취소하면 풀로 돌아간다.
- 오늘 목록의 날짜 이월은 일정이 있는 완료 항목을 `archive`로 옮기고, 일정 없는 완료 항목은
  기존 규칙대로 원본만 정리한다. 완료 이력은 유지한다. 기간 저장과 이월은 같은 이슈 행 잠금으로 직렬화한다.
- 이슈를 명시적으로 삭제하면 연결된 일정도 삭제한다. 기존 완료 이력은 계속 남는다.
- 창 포커스 복귀와 15초 주기로 일정을 다시 읽는다. 쓰기 이전의 늦은 조회 응답은 버린다.

## 적용과 검증

`20261008090000_issue_schedule`을 **공유 DB에 적용한 다음** 새 Prisma 클라이언트와 앱을 배포해야 한다.
마이그레이션은 새 테이블만 만들며 기존 이슈나 완료 이력을 바꾸지 않는다. 공유 DB 적용은 별도 승인 후
읽기 전용 사전 확인·검증된 백업·`migrate deploy`·재조회 순서를 따른다. 로컬 테스트 DB 적용은 공유 DB 적용을 의미하지 않는다.

```sh
node --experimental-strip-types --env-file-if-exists=.env --test --test-concurrency=1 lib/task-schedule.test.mjs lib/server/task-schedule-store.test.mjs lib/server/task-schedule-http.test.mjs lib/server/board-store.test.mjs lib/server/task-access.test.mjs lib/today-board.test.mjs lib/rollover.test.mjs lib/ui-reference/component-reuse.test.mjs
pnpm typecheck
pnpm build --webpack
```

DB 테스트는 `lib/test-database.ts`로 제한한 `localhost:5432/project_management_test`에서만 실행한다.
브라우저 검증은 사용자 요청 시에만 수행한다.
