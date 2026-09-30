# 채용 자료

채용 메뉴의 포트폴리오(`/portfolio`), 경험정리(`/recruitment/experiences`)와 자기소개서(`/recruitment/cover-letters`)는 OWNER 전용이다. 포트폴리오는 처음 저장된 문서를 자동으로 열고 동일한 항목별 편집기를 사용한다.

문서는 기존 공유 PostgreSQL의 `app_setting`에 `recruitment:document:<id>` 키로 저장한다. `kind`는 `PORTFOLIO`, `EXPERIENCE` 또는 `COVER_LETTER`, `scope`는 `COMPANY`, `PERSONAL`, `GENERAL`이다. 제목·프로젝트(지원 회사)·요약·태그·본문 항목·출처 URL 및 `revision`, `updatedAt`을 보존한다. 테이블 추가나 마이그레이션은 없다. 자료 내용을 코드나 localStorage에 저장하지 않는다. 포트폴리오의 이력서 본문도 DB에만 보관하며 경험정리·자기소개서 목록과 분리한다. 초기 자료는 아래 등록 도구로 명시적으로 넣고 GET에서 생성하지 않는다.

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

## 지원용 정보 · 나만 보기

`/portfolio`의 별도 접이식 영역에서 자격증·수상·어학 정보를 관리한다. 명칭, 발급·주관 기관, 취득·수상일, 자격증·등록 번호, 등급·점수·훈격, 만료일, 메모를 입력하고 각 값 또는 항목 전체를 복사할 수 있다. 날짜는 원문 정밀도를 유지하도록 `YYYY`, `YYYY-MM`, `YYYY-MM-DD`를 허용하고 번호는 앞자리 0을 보존하는 문자열로 저장한다. 모르는 값은 빈칸으로 둔다.

내용은 공유 `app_setting`의 `recruitment:credentials`에 저장하며 코드·localStorage에 넣지 않는다. 포트폴리오 본문과 별도 저장하므로 채용 문서 목록·상세·내용 복사에 자동 포함되지 않는다. `/portfolio`의 원본 문서와 지원용 정보는 OWNER 전용이며 아래 공개용 본문과도 별개다. `/api/portfolio/credentials`의 GET/PUT은 기존 세션 기반 OWNER 검증을 직접 수행하고 PUT은 같은 출처와 JSON 입력을 확인한다. GET은 읽기 전용이고 응답은 `private, no-store`다.

상세 영역을 열었을 때만 조회하며 편집 중에는 자동 갱신하지 않는다. 저장은 수정 버전과 기존 JSON 비교 조건을 모두 사용한다. 충돌 시 409를 반환하고 입력을 유지한다. 초기 이력서 자료에 있던 취득·수상일은 지원용 정보로 옮기고 일반 본문에서는 제거한다. 이후 본문에 수동으로 적은 정보는 자동으로 분류하거나 제거하지 않는다.

기존 포트폴리오에서 정보를 분리할 때 `scripts/import-recruitment-credentials.mjs`를 사용한다. 입력 JSON에는 `documentId`, `expectedRevision`, `items` 및 정확한 문자열 변경 목록 `replacements`(sectionTitle/from/to/count)를 넣는다. 실제 개인정보가 들어 있는 입력 파일은 저장소 밖에 두고 작업 후 삭제한다.

```sh
pnpm db:shared -- node --experimental-strip-types scripts/import-recruitment-credentials.mjs inspect /absolute/path/input.json
pnpm db:shared -- node --experimental-strip-types scripts/import-recruitment-credentials.mjs apply /absolute/path/input.json <inspect-sha256> /absolute/path/backup.json
```

등록 도구는 기존 지원용 정보가 있으면 덮어쓰지 않는다. 원본 문서 버전과 치환 횟수를 검증하고, 두 키의 이전 상태를 백업·해시 검증한 뒤 SERIALIZABLE 트랜잭션으로 분리한다. 저장 후 문서와 지원용 정보를 재조회해 모두 대조한다. 백업에는 기존 개인정보가 포함될 수 있으므로 Git 제외 경로에 권한 0600으로 보존한다.

검증: `lib/recruitment-credentials.test.mjs`, `lib/server/recruitment-credentials-store.test.mjs`, `lib/server/recruitment-credentials-import.test.mjs`, `lib/access/policy.test.mjs`.

## 로그인 없는 공개 포트폴리오

`/portfolio/show`는 업무 셸 없이 소개·핵심 역량·기술 스택·프로젝트·교육과 활동을 보여준다. 정확한 이 경로의 GET/HEAD만 세션 없이 허용한다. `/portfolio/public` 관리 화면과 `/api/portfolio/public` GET/PUT은 OWNER 전용이며 쓰기는 같은 출처의 JSON 요청을 요구한다. `/portfolio`에서 관리 화면으로 이동할 수 있다.

공개 본문은 공유 `app_setting` 키 `recruitment:public-portfolio`에 별도로 저장한다. 개인 소개를 소스 코드에 넣거나 원본 채용 문서·자격 정보·고객 자료·Drive 출처 링크를 자동 복사하지 않는다. 입력과 조회는 허용된 공개 필드로 새 객체를 만들며 링크는 인증 정보가 없는 HTTPS만 허용한다. 본문은 React 텍스트로 렌더링한다. 공개 행이 없거나 `published: false`면 404를 반환하며 GET에서 생성하지 않는다. 응답은 no-store이고 검색 색인은 비활성화한다. 공개 설정은 링크를 아는 누구나 조회할 수 있다는 뜻이다.

관리 화면에서 본문과 순서를 편집하고 저장 전 미리보기·공개 링크 복사를 할 수 있다. 공개 체크와 본문 변경은 저장할 때 함께 적용된다. 쓰기는 expectedRevision과 기존 JSON 전체를 비교해 충돌 시 409를 반환하고 편집 내용을 유지한다. 포커스 복귀·15초 갱신은 편집 중인 내용을 덮어쓰지 않는다. 코드 최초 배포 후 내용 변경은 재배포 없이 반영된다. 테이블·마이그레이션 추가는 없다.

초기 등록 JSON은 `{ "expectedRevision": 0, "portfolio": { "published": true, "content": { ... } } }` 형태이며 개인 내용은 Git 제외 경로에 둔다. 검토 토큰은 입력 해시와 당시 DB 행을 함께 고정하고, apply는 0600 백업을 검증한 뒤 SERIALIZABLE 트랜잭션으로 한 키만 저장하고 전체 내용을 다시 대조한다.

```sh
pnpm db:shared -- node --experimental-strip-types scripts/import-public-portfolio.mjs inspect /absolute/path/input.json
pnpm db:shared -- node --experimental-strip-types scripts/import-public-portfolio.mjs apply /absolute/path/input.json <inspect-sha256> /absolute/path/backup.json
```

검증: `lib/public-portfolio.test.mjs`, `lib/server/public-portfolio-store.test.mjs`, `lib/server/public-portfolio-import.test.mjs`, `lib/access/policy.test.mjs`. 통합 테스트는 로컬 테스트 DB에서만 수행한다. DB 등록, 코드 커밋·푸시와 배포는 각각 구분한다.
