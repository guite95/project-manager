# 채용 자료

채용 메뉴의 경험정리(`/recruitment/experiences`)와 자기소개서(`/recruitment/cover-letters`)는 OWNER 전용이다. 기존 포트폴리오는 그대로 유지한다.

문서는 기존 공유 PostgreSQL의 `app_setting`에 `recruitment:document:<id>` 키로 저장한다. `kind`는 `EXPERIENCE` 또는 `COVER_LETTER`, `scope`는 `COMPANY`, `PERSONAL`, `GENERAL`이다. 제목·프로젝트(지원 회사)·요약·태그·본문 항목·출처 URL 및 `revision`, `updatedAt`을 보존한다. 테이블 추가나 마이그레이션은 없다. 자료 내용을 코드나 localStorage에 저장하지 않는다.

목록 GET은 본문과 출처를 제외한 요약만 조회한다. 상세 GET은 선택한 문서만 읽으며 GET은 데이터를 생성하지 않는다. PUT은 서버에서 OWNER와 같은 출처의 JSON 요청을 확인하고 내용을 검증한다. 신규 문서는 expectedRevision 0, 수정은 조회한 revision을 요구한다. 저장은 기존 JSON 전체를 비교한 조건부 갱신이며 충돌 시 409를 반환한다. 클라이언트는 실패한 편집 내용을 유지한다. 본문은 React 텍스트로 출력하며 HTML을 실행하지 않는다.

로컬 `pnpm dev`와 배포 앱은 같은 DB를 사용한다. 새 화면 코드의 최초 배포 이후에는 내용 수정에 재배포가 필요 없다. 목록과 열어 둔 상세는 화면 포커스 복귀·표시 복귀 및 15초 간격으로 갱신한다. 편집 중인 상세는 갱신으로 덮어쓰지 않는다. `pnpm dev:local`은 별도 로컬 DB이므로 이 공유 동작의 대상이 아니다.

## 경험 자료 등록

기존 Drive 경험 정리 자료를 문서별로 변환해 명시적으로 등록한다. Drive와 DB 사이의 자동 동기화는 없다. Drive 원본 URL을 남기고, Git 작성자·본인 기여·테스트·배포·실사용의 확인 범위를 구분한다. 최초 등록은 개인 경험 23개, ERP 본인 경험 9개, 프로젝트 개요 8개, 공통 작성 가이드 1개다. ERP06은 타인 작업으로 개요의 제외 항목에만 기록한다. 자기소개서는 사용자가 새 문서를 작성할 때 생성한다.

`scripts/import-recruitment.mjs`는 런타임과 같은 검증기를 사용한다. 입력은 문서 입력 필드와 `id`를 가진 JSON 배열이다. 실제 경험 내용은 저장소에 포함하지 않는다.

```sh
pnpm db:shared -- node --experimental-strip-types scripts/import-recruitment.mjs inspect /absolute/path/documents.json
pnpm db:shared -- node --experimental-strip-types scripts/import-recruitment.mjs apply /absolute/path/documents.json <inspect-sha256> /absolute/path/backup.json
```

inspect는 조회 전용이다. apply는 해시 일치, 기존 내용 대조, 대상 키·행 백업 및 해시 검증 후 SERIALIZABLE 트랜잭션으로 신규 행만 생성한다. 이미 동일한 문서는 건너뛰며, 기존 내용이 다르면 실패한다. 저장 후 전체 문서 내용을 재조회해 대조한다. 백업 경로는 새 파일이어야 한다. 공유 DB에서는 테스트를 실행하지 않는다.

검증: `lib/recruitment.test.mjs`, `lib/server/recruitment-store.test.mjs`, `lib/server/recruitment-import.test.mjs`, `lib/access/policy.test.mjs`. DB 테스트는 `lib/server/test-db.mjs`가 허용하는 로컬 테스트 DB만 사용한다. 브라우저 검증은 사용자 요청 시에만 수행한다.
