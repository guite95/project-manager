# 프로젝트 매니지먼트

프로젝트 진행을 돕는 워크스페이스. 1단계는 **업무 플로우차트**를 그리는 것이다.

## 스택

| 목적 | 선택 |
| --- | --- |
| 프레임워크 | Next.js 16 (App Router) + TypeScript |
| 스타일 | Tailwind CSS v4 + `--bi-*` CSS 변수 토큰 |
| 그래프 렌더링 | [@xyflow/react](https://reactflow.dev) (React Flow v12) |
| 자동 레이아웃 | [@dagrejs/dagre](https://github.com/dagrejs/dagre) |
| 문서 | MDX (`@next/mdx` + `remark-gfm`) |
| 아이콘 | `react-icons` (Heroicons v1 아웃라인) |
| 데이터베이스 | PostgreSQL + Prisma 7 (`pg` 드라이버 어댑터) |
| 테스트 | `node --test` (`lib/**/*.test.mjs`) |

플로우차트 구성 방식은 artisan 프로젝트의 `Web/app/docs/architecture/flow-guide`
방식을 바탕으로 한다. 기본 배치는 Dagre가 계산하고, 사용자가 UI에서 조정한 좌표·연결 면·경유점은 차트 JSON의 `layout`에 저장한다.

## 환경변수

`.env.example` 을 `.env` 로 복사해 채운다. `.env` 는 커밋하지 않는다.

| 이름 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `TEST_DATABASE_URL` | 통합 테스트용 별도 데이터베이스 |
| `APP_PASSWORD_HASH` | 소유자 최초 등록 전 기존 비밀번호 로그인용 해시 |
| `SESSION_SECRET` | 소유자 최초 등록 전 기존 서명 세션용 키 |

Homebrew 로 깐 PostgreSQL 은 기본 사용자가 OS 계정 이름이다. 접속 문자열에
사용자를 빼면 `P1010: User was denied access` 가 난다.

## 실행

```bash
pnpm install
createdb project_management
createdb project_management_test
pnpm db:migrate   # 마이그레이션 적용
pnpm dev          # SSH 터널로 서버 DB 공유 · http://127.0.0.1:30001
pnpm dev:local    # 별도 로컬 DB를 사용하는 명시적 대안
pnpm build        # 프로덕션 빌드
pnpm typecheck    # tsc --noEmit
pnpm test         # node --test
```

### 데이터베이스를 다룰 때

**`project_management` 는 실제 데이터가 들어 있는 개발 DB 다. 비우지 않는다.**
백업도 WAL 아카이브도 켜져 있지 않아 되살릴 방법이 없다. 브라우저 localStorage
사본도 첫 이관 때 지워진다.

테스트 데이터를 정리할 때는 이것만 쓴다. 개발 DB 를 가리키면 멈춘다.

```bash
pnpm db:reset-test
```

작업 전에 백업해 두면 마음이 편하다.

```bash
pg_dump project_management | gzip > backup-$(date +%F).sql.gz
```

**개발·운영 모두 계정 로그인이 필요하다.** 소유자 최초 등록 전에는 계정 ID를 비워 두고
기존 비밀번호로 로그인한 뒤 설정에서 소유자 계정을 등록한다. 이후 공통 비밀번호와
기존 서명 세션은 사용할 수 없다. 계정 발급·프로젝트 권한·페이지 공유는
[계정 및 공유](docs/account-access.md)를 참고한다.

배포는 `docs/deploy.md` 를 본다.

## 라우트

| 경로 | 내용 |
| --- | --- |
| `/login` | 계정 로그인. 개발·운영 모두 인증 |
| `/account` | 내 비밀번호 변경 및 기존 세션 회수 |
| `/settings` | 관리자 계정 발급·프로젝트 권한·조회 전용 공유 |
| `/share/<token>` | 만료·회수 가능한 단일 문서 조회 |
| `/today` | 오늘의 할 일 — 프로젝트별 이슈를 끌어다 놓고 체크, 날짜가 바뀌면 자동 정리 |
| `/today/history` | 날짜별 완료 이력 — 체크한 순간의 날짜로 쌓인다 |
| `/flows` | 전체 목록 — 프로젝트 → 카테고리 → 차트 |
| `/flows/[project]?cat=&chart=` | 프로젝트 화면 — 쿼리파람으로 차트 전환, 잘못된 값은 첫 차트 폴백 |
| `/flows/[project]/meetings` | 각 프로젝트의 회의록 목록·검색, 등록 전 빈 화면 |
| `/flows/[project]/meetings/[meeting]` | 회의록 상세 — 요약·논의·결정·태스크과 전사본 원문 탭 |
| `/flows/common/notes` | 명심할 점 — 4단계 우선순위와 서버 자동 저장. 공통 프로젝트에만 있다 |
| `/personal` | 개인 프로젝트 목록 — 프로젝트별 자료·기록·회의록 |
| `/records/work-records` | Git 기반 프로젝트별 기여 요약·기간·대표 근거·최근 커밋 |
| `/portfolio` | 채용 하위의 포트폴리오 기본 화면 — 편집 기능은 추후 추가 |
| `/guide` | 플로우차트 작성 가이드 (MDX) |

## 2단 사이드바와 공유 화면 설정

오늘의 할 일의 이슈 영역은 **프로젝트 이슈 / 개인 이슈** 탭으로 나뉜다. 선택한 탭 아래에
남색 밑줄을 표시하며 탭 사이 구분선은 없다. 개인 이슈는 별도로 추가하며 기존 프로젝트 이슈를
자동 재분류하지 않는다. `issue.project_slug`의 예약값 `__personal_issues__`로 구분하고,
오늘 목록 이동·수정·삭제·완료 이력을 기존 DB 저장 흐름으로 처리한다. 탭 선택은 일시적인 화면 상태다.

데스크톱에서는 60px 주 메뉴와 235px 상세 메뉴를 사용한다. 주 메뉴는 할 일·풀링·개인으로
나뉘며, 작업 기록과 포트폴리오는 개인 하위 메뉴에, 작성 가이드는 하단 보조 메뉴에 배치한다.
포트폴리오는 현재 기본 진입 화면만 제공한다. 상세 메뉴를 접어도 주 메뉴는 남으며, 모바일에서는
상단 왼쪽 메뉴 버튼으로 탐색한다. 열 때마다 전체 메뉴를 보여 주고,
상위 메뉴를 누르면 바로 아래에 하위 메뉴를 펼친다. 한 번에
하나의 상위 메뉴만 열리며, 다른 메뉴를 열면 기존 메뉴는 닫힌다. 열린 메뉴를 다시
누르면 접힌다. 실제 화면 이동은 하위 링크를 선택할 때만 일어난다.

프로젝트 상세 메뉴는 프로젝트 → 카테고리까지만 표시하고, 개별 차트는 본문 상단
선택기에서 제목·설명·종류(차트/ERD)를 보고 선택한다. 검색 중에는 프로젝트명,
카테고리명, 차트 제목·설명과 명심할 점·외부 링크까지 검색하며 차트로 바로 이동한다.
PC와 모바일 모두 프로젝트 메뉴는 처음에 전체가 접혀 있고, 한 번에 하나만 펼친다.
프로젝트 펼침 상태는 일시적인 화면 상태로 관리하며 이전 DB의 펼침 값은 복원하지 않는다.

오늘의 할 일·프로젝트·가이드는 `app/(workspace)/layout.tsx`의 공통 셸을 유지한다.
메뉴와 목록은 `lib/server/flow-catalog-store.ts`에서 JSONB의 제목·설명·개수만 조회하고,
차트 상세는 선택한 차트의 그래프만 조회한다. 메타데이터와 본문의 중복 조회는 요청
범위의 React cache로 합치며, 다음 서버 요청에서는 DB를 다시 읽는다.
메뉴는 `GET /api/flows/navigation`으로 창 복귀 및 화면이 보이는 동안 15초마다 갱신한다.
기존 전체 차트 API는 유지하며, 본문 로딩 중에는 공통 메뉴와 로딩 표시를 보여 준다.

화면 설정은 로컬·배포 앱이 사용하는 공유 PostgreSQL의 `app_setting`에 저장한다.

| 키 | 저장 내용 |
| --- | --- |
| `sidebar:project-order` | 사이드바 프로젝트 순서 |
| `ui:navigation` | 상세 메뉴 패널 접힘 |
| `ui:reference-columns` | UI 레퍼런스 표의 컬럼 표시·순서·너비 |
| `board` | 기존 오늘의 할 일 보드 설정 |

`GET/PATCH /api/ui-settings/navigation`, `GET/PATCH /api/ui-settings/reference-columns`는
허용된 설정만 읽고 저장한다. PATCH는 `{ changes: { ... } }` 형식이며 변경한 항목만
비교 후 갱신하여 다른 브라우저의 별도 설정 변경을 보존한다. 예를 들어
`{ "changes": { "panelCollapsed": true } }`로 저장한다.
조회는 DB를 변경하지 않고, 최초 변경 때 설정 키를 생성하므로 스키마 마이그레이션은 없다.

새 UI 설정은 새로고침·창 복귀와 화면이 보이는 동안 15초 간격으로 동기화한다.
저장 실패는 화면에 알리고 마지막으로 확인한 값으로 복구한다. 기존 브라우저의
컬럼 설정은 공유 키가 없을 때만 최초 이관하며, 공유 값이 있으면 우선한다.
예전 localStorage 값은 보존하지만 이후 설정 저장에는 사용하지 않는다.
검색어, 프로젝트·모바일 메뉴의 일시적인 열림, 현재 차트 URL은 영구 설정에 포함하지 않는다.

### 사이드바 프로젝트 순서

프로젝트 제목 오른쪽 손잡이를 드래그해 프로젝트 단위로 순서를 바꾼다.
손잡이에 키보드 포커스를 두고 `↑`·`↓`를 눌러도 이동한다.
공통·고객사·외부 링크 프로젝트를 같은 목록에서 옮기며 하위 메뉴는 함께 이동한다.
검색 중에는 순서 변경을 막고, 저장 실패 시 이전 순서로 돌아가 오류를 표시한다.

순서는 `app_setting`의 `sidebar:project-order`에 저장한다.
`GET/PUT /api/sidebar/order`와 앱 셸이 같은 값을 읽으므로, 이 기능이 배포된
로컬·원격 앱은 새로고침 시 같은 순서를 표시한다. 오늘의 할 일 보드 순서와
상세 메뉴 패널의 접힘 설정은 각각의 DB 설정 키로 유지한다.

## UI 컴포넌트 레퍼런스

`전체 프로젝트 → UI 컴포넌트` (`/flows?view=components`)에서 FocusAI의
`apps/web/app/(dev)/dev/ui` 요소를 확인한다. 2026-09-14 로컬 소스를 기준으로
토큰·타이포그래피·버튼·입력폼·날짜 및 기간 선택·배지·기본 테이블과 필터·
상세 필터 패널과 칩·관리형 테이블·상세 모달·로딩 상태의 11개 섹션을 옮겼다.

예시는 `components/ui-reference`, 재사용 부품은 `components/erp`에 있다.
원본의 `--demo-*` 색상·모션 토큰은 이 앱의 `--bi-*` 토큰에 대응시켰다.
FocusAI 서버/API에 연결하지 않으며, 폼·필터·모달은 화면 상태만 변경하고
컬럼 표시·순서·너비는 공유 DB의 `ui:reference-columns`에 저장한다.
기본 테이블에서는 검색·상태·등록일 기간이 샘플 행에 실제로 적용된다.

## 디렉터리

```
prisma/
  schema.prisma          테이블 정의 (접속 URL 은 prisma.config.ts 에)
  migrations/            마이그레이션
prisma.config.ts         Prisma CLI 설정
proxy.ts                 세션 검사 (Next 16 은 middleware 대신 proxy 규약)
Dockerfile               배포 이미지 (standalone 출력)
docker-compose.yml       앱 컨테이너만. PostgreSQL 은 기존 컨테이너를 쓴다
app/
  globals.css            --bi-* 디자인 토큰 (색의 단일 진실 공급원)
  api/                   REST 라우트 (보드 · 명심할 점 · 이력 · 로그인 · 이관)
  login/                 로그인 화면
  (workspace)/
    layout.tsx           공통 메뉴 셸
    loading.tsx          본문 로딩 표시
    today/               오늘의 할 일 · 완료 이력
    flows/               목록 · 차트 상세 · 프로젝트 명심할 점 라우트
    guide/page.mdx       작성 가이드
components/
  inline-edit.tsx        연필을 눌러야 열리는 제자리 편집 (이슈·명심할 점 공용)
  project-notes/         명심할 점 편집 표
  today-board/           오늘의 할 일 보드 (이슈 풀 · 오늘 목록 · 완료 이력)
  flow/
    types.ts             FlowChart · NodeKind · EdgeKind 선언 타입
    kind-style.ts        kind → 카드 스타일 표 (노드·범례 공용)
    flow-node.tsx        노드 카드 렌더
    group-node.tsx       섹션(그룹) 박스 렌더
    flow-theme.ts        엣지 색 상수 (SVG 마커는 var() 불가라 hex)
    layout.ts            Dagre 2단 좌표 계산 + 엣지 kind→스타일
    process-flow.tsx     읽기 전용 캔버스 + 전체화면 모달
    flow-legend.tsx      차트별 색 범례
  mdx/                   Callout · Steps (MDX 컴포넌트)
  shell/                 2단 사이드바 + 모바일 메뉴 + 프로젝트·카테고리 검색
  rich-text.tsx          `**강조**` 만 지원하는 초소형 리치텍스트
lib/
  db.ts                  Prisma 클라이언트 (처음 쓸 때 연결한다)
  api-client.ts          화면이 쓰는 fetch 래퍼
  api-types.ts           라우트 공용 헬퍼
  today-board.ts         보드 상태 전이 순수 함수
  rollover.ts            날짜가 바뀐 오늘 목록 정리 판정
  completions.ts         완료 이력 타입과 날짜별 묶기
  project-notes.ts       명심할 점 순수 함수
  import-legacy.ts       localStorage 데이터 읽기·지우기
  password.ts            scrypt 해시 (Node 런타임 전용)
  session.ts             세션 서명 (Web Crypto, proxy 에서도 동작)
  server/                DB 접근 계층. 라우트 핸들러만 부른다
lib/flows/
  registry.ts            DB에서 읽은 트리의 URL·폴백 헬퍼
  document.ts            저장 JSON의 형식·참조 검증
  initial-catalog.ts     최초 이관 원본 (런타임에서 읽지 않음)
lib/server/flows-store.ts  DB 차트 조회·revision 조건부 저장
scripts/
  hash-password.mjs      APP_PASSWORD_HASH 만들기
```

`lib` 안에서 값을 가져올 때는 상대 경로에 `.ts` 확장자를 붙인다. `@/` 별칭은
tsconfig 만 아는 것이라 `node --test` 가 `.ts` 를 직접 읽을 때 해석하지 못한다.
타입만 가져올 때는 컴파일에서 지워지므로 `@/` 를 써도 된다.

## 플로우차트 JSON 저장

프로젝트마다 회의록 공간이 있으며 결정 사항과 태스크를 추가·수정·삭제하고 저장할 수 있다.
공통 프로젝트에는 사이드바와 전체 목록의 회의록 메뉴를 표시하지 않는다.
로컬 스킬이 생성할 결과물은 기존 문서의
`content.kind: "meeting"` 형식으로 표시하며, 규약은 [회의록 문서](docs/meetings.md)를
참고한다. `skills/sync-sum`는 Codex·Claude Code 공용 로컬 스킬이며,
전사본 기반 초안 생성·원문 보존·형식 검증과 승인한 신규 회의록 등록을 지원한다.
`node skills/sync-sum/scripts/install.mjs`로 두 도구에 설치한다.

현재 차트의 원천은 PostgreSQL이다. `flow_project`와 `flow_category`가 순서와 메뉴 정보를,
`flow_document.document` JSONB가 차트 한 장의 `nodes`, `edges`, `groups`, 설명과 배치 방향을 담는다.
`app_setting`의 `erd:tns` 값은 ERD 상세/드릴다운에 쓰는 전체 스키마 스냅샷이다.
ERD의 실제 좌표·관계선 경로도 `app_setting`의 `erd:tns:layout:domain:*`와
`erd:tns:layout:table:*`에 저장한다. 화면은 필요한 배치만 읽으며 자동 재계산·덮어쓰기는 하지 않는다.
최초 배치 등록과 백업 절차는 [ERD 문서](lib/erd/README.md#db-배치-저장)를 참고한다.
최초 이관 마이그레이션이 기존 28개 차트를 저장하며, 재배포 시 수정된 JSON을 덮어쓰지 않는다.
기존 `lib/flows/*.ts`와 `lib/erd/tns-schema.json`은 이관·테스트용 원본으로만 남긴다.

로그인한 세션으로 다음 API를 사용한다. 캔버스 자체는 계속 읽기 전용이다.

- `GET /api/flows`: DB의 프로젝트·카테고리·차트 목록.
- `GET /api/flows/tns/hr-overall`: `{ chart, revision, projectSlug, categorySlug, updatedAt }`.
- `PUT /api/flows/tns/hr-overall`: `Content-Type: application/json`으로 `{ chart, revision }`을 전송.
  GET에서 받은 revision을 함께 보내며, 다른 곳에서 먼저 수정했으면 409로 거절한다.
  성공 후 페이지를 새로고침하면 변경이 반영된다. JSON 데이터 수정은 재배포가 필요 없다.
- ERD는 전체 스냅샷과 파생 차트를 함께 갱신해야 하므로 일반 차트 PUT으로 수정하지 않는다.

프로젝트·카테고리 추가나 ERD 갱신은 현재 별도 관리 UI가 없으며 검증된 DB 변경으로 수행한다.
JSON 규약과 예시는 `/guide`를 참고한다.

## 로컬과 배포 환경의 DB 공유

`pnpm dev`는 개인 SSH 키로 서버의 loopback PostgreSQL 포트에 터널을 열고 서버의
`project_management` DB를 사용한다. 이슈·메모·완료 이력·설정·차트가 모두 공유된다.
서버 앱의 기존 DB URL은 SSH로 읽어 자식 프로세스 환경변수에만 주입하며 파일에 복사하지 않는다.
DB 이름과 앱 역할을 확인한 뒤 실행하고, 로그인도 강제한다. 로컬 로그인은 로컬 `.env`의
`APP_PASSWORD_HASH`/`SESSION_SECRET`을 사용한다.

`.env.example`의 `SHARED_DB_SSH_*` 메타데이터만 개인 환경에 맞춘다.
서버 PostgreSQL은 `127.0.0.1:15432`, 터널 기본 포트는 로컬 `127.0.0.1:15435`다.
서버 키 검증을 끄지 않는다. 최초 접속 시 서버 공개키를 신뢰할 수 있는 경로로 확인해 known_hosts에 등록한다.
로컬 포트가 이미 사용 중이면 기존 프로세스를 건드리지 않고 중단한다.
필요하면 `SHARED_DB_LOCAL_PORT`로 다른 포트를 지정한다.

```bash
pnpm dev                  # 터널 + localhost 개발 서버. Ctrl+C로 함께 종료
pnpm db:shared:status     # 공유 DB 마이그레이션 상태
pnpm db:shared:deploy     # 승인한 forward migration만 공유 DB에 적용
pnpm db:shared -- node scripts/your-db-command.mjs
```

`DATABASE_URL`은 `dev:local` 및 로컬 Prisma 작업용으로 기존 값을 보관한다.
`TEST_DATABASE_URL`은 로컬 `localhost:5432/project_management_test`만 허용한다.
공유 DB에서 `migrate dev`, `db push`, reset과 통합 테스트를 실행하지 않는다.
로컬 DB에만 남은 실제 업무 데이터는 자동으로 서버와 합치거나 삭제하지 않는다.
공유 전환 전 데이터 차이를 확인하고 필요한 항목만 별도로 이관한다.

## 포커스에이아이 레퍼런스 콘텐츠

`/flows/focus-ai`에서 2026-09-14에 가져온 원본 콘텐츠 24개와 빈 회의록 안내를 확인한다.
업무·구조 차트 20개, WBS/TODO 111개(완료 26개), ERD 38개 테이블/114개 FK,
킥오프 슬라이드 14장, Forecast HTML 보고서를 포함한다. 원본 회의록은 0건이다.
NotebookLM 링크는 포함하지 않는다.

이 데이터는 공유 DB의 `flow_project`, `flow_category`, `flow_document.document`에 저장한다.
`data/imports/focus-ai-2026-09-14.json`은 최초 가져오기용 스냅샷이며, 런타임은 이 파일을
읽지 않는다. 일정·완료 상태도 가져온 시점의 스냅샷이고 원본 사이트와 자동 동기화하지 않는다.
슬라이드 이미지와 CSS, 보고서 본문을 함께 저장하여 원본 로그인과 외부 요청 없이 표시한다.
HTML은 스크립트·폼·외부 요청을 허용하지 않는 sandbox iframe에서만 표시한다.

`pnpm db:shared -- node scripts/import-focus-reference.mjs`는 읽기 전용 사전 검사다.
사용자가 가져오기를 승인한 경우에만 `--apply`로 추가한다. 적용 전 관련 카탈로그를
`~/pm-backups`에 백업하고 파일 해시를 검증한다. 프로젝트 전체를 한 트랜잭션으로 추가하며,
동일 slug가 있으면 덮어쓰지 않고 중단한다. 적용 후 문서 전체 일치와 기존 프로젝트 보존을
검증한다. 스키마 변경은 없으며, 새 자료 뷰어는 이 코드가 배포된 앱에서 사용할 수 있다.

## 프로젝트 자료

자료 목록의 **삭제** 버튼 또는 상세 상단의 **삭제** 버튼에서 제목을 확인한 후 자료를
삭제할 수 있다. 삭제는 해당 프로젝트의 선택한 자료에만 적용되며 복구할 수 없다.
상세에서 삭제하면 자료 목록으로 돌아간다. 기존 HTML·발표 자료도 삭제할 수 있다.

각 프로젝트의 **자료** 메뉴(`/flows/[project]/materials`)에서 PDF·UTF-8 HTML·PPTX 파일을
제목과 함께 추가한다. 파일당 최대 10MB이며, 파일 형식·내용·크기를 서버에서도 검사한다.
기존 HTML·발표 콘텐츠도 같은 목록에서 조회한다. 업로드 원본은 `content.kind: "material"`의
OCI 저장소가 설정된 환경에서는 파일명·크기·서버 소유 저장소 참조를 공유 DB에 기록하고 본문은 private Object Storage에 저장한다.
저장소가 설정되지 않은 로컬 환경은 기존처럼 본문을 공유 DB 콘텐츠에 보관한다.
목록·메뉴에는 파일 본문을 전달하지 않는다.
자료 카테고리는 첫 업로드 때 생성하며 스키마 변경은 없다.

자료 목록은 공통 `DataTable`로 표시하며, 상세 상단에서 형식 배지·검색 가능한 자료 선택·
현재/전체 개수를 확인한다. 자료 추가 폼은 버튼으로 펼친다. 앱의 선택 입력은 공통
`Dropdown`을 사용하며 검색을 기본 제공한다. 한글 초성 검색, 방향키·Enter 선택,
Escape 닫기를 지원하고 표·팝오버·전체화면에서도 같은 컴포넌트를 사용한다.

PDF는 브라우저 PDF 뷰어로 표시하고 원본 다운로드를 제공한다. PPTX는 업로드 시 서버의
LibreOffice에서 PDF를 생성해 같은 뷰어로 표시하며 원본 PPTX와 변환된 PDF를 각각 다운로드한다.
애니메이션·전환·동영상은 PDF 미리보기에 포함되지 않고, 서버에 없는 글꼴은 대체될 수 있다. HTML은 스크립트와
same-origin 권한이 없는 CSP sandbox iframe에서만 표시한다. `.slide`, `[data-slide]`,
`.page`, `[data-page]`가 반복되는 문서는 페이지 선택·이전/다음·전체 문서 전환을 제공한다.
기본 CSS에 px 폭/높이가 있는 슬라이드는 원문 비율로 자동 확대·축소한다. 일반 보고서는
연속 스크롤로 표시한다. 새 창에서도 같은 격리된 뷰어를 사용하며 원본 다운로드는 보존한다.
외부 이미지·폰트·스크립트는 미리보기에서 차단하므로 자산을 포함한 HTML을 사용한다.

Next.js 프록시의 본문 한도는 multipart 부가 정보를 포함해 11MB로 설정하고 자료 API는
파일 10MB 한도를 별도로 적용한다. 배포 앞단 프록시에도 업로드 요청을 수용하는 한도가 필요하다.
PPTX 변환 결과 PDF는 최대 16MB이며 변환 프로세스는 격리된 임시 디렉터리와 60초 제한을 사용한다.

## 작업 정리 스킬

완료 이력의 **작업 정리** 탭에는 `work-sum`이 Git 커밋과 완료 체크를 합쳐 저장한
날짜별 결과가 표시된다. **작업내용 복사**도 이 탭에서 선택한 날짜의 정리 목록을 복사한다.
기본 Git 탐색 위치는 `~/Documents/project`이며 원본 완료 기록은 유지한다.

`node skills/work-sum/scripts/install.mjs`로 Codex와 Claude에 함께 설치한다.
사용법과 저장·검증 기준은 [docs/work-summary.md](docs/work-summary.md)를 참고한다.

## 범용 플로우 작성 CLI와 스킬

```bash
node scripts/install-flow-tools.mjs
~/.local/bin/pm-flow list
~/.local/bin/pm-flow pull tns/finance/finance-sales --out draft.json
~/.local/bin/pm-flow validate draft.json
~/.local/bin/pm-flow diff draft.json
~/.local/bin/pm-flow apply draft.json
```

Node 22.6 이상이 필요하다. CLI는 다른 프로젝트의 작업 디렉터리에서도 이 저장소의
개인 SSH 설정을 사용한다. 출력 파일은 호출한 디렉터리 기준이다. 기존 프로젝트/카테고리에서
`new project/category/chart --out draft.json`으로 신규 차트를 준비할 수 있다.
프로젝트·카테고리 생성/이동, ERD와 콘텐츠 문서는 이 CLI 범위에 포함되지 않는다.

`apply`는 `~/.pm-backups/` 원문 백업과 SHA-256 재검증, 행 잠금, revision 조건 저장,
DB 재조회 대조를 수행한다. revision 0은 신규 생성 전용이다. 충돌 시 최신 문서를 pull해
변경을 다시 적용한다. 파일의 revision을 임의로 올려 재시도하지 않는다.

설치기는 `pm-flow-author`, `pm-flow-review`를 `$CODEX_HOME/skills` (기본 `~/.codex/skills`)와
Claude Code의 `~/.claude/skills` (`CLAUDE_CONFIG_DIR` 반영)에
심볼릭 링크로 연결한다. 기존 설치는 덮어쓰지 않는다. 새 세션에서 스킬을 사용할 수 있다.
작성가이드 `/guide`에는 스킬 목록, 예시와 JSON 기준을 안내한다.

일반 차트의 **배치 편집**은 보기 모드와 분리된다. 저장 시 기존 PUT API와 revision을 사용한다.
내용 수정에서 layout을 생략하면 살아 있는 노드 ID의 위치를 보존하고 삭제된 ID·대상이 바뀐 선의
배치는 제거한다. 명시적 빈 layout은 자동 배치 초기화다. ERD의 app_setting 배치 저장은 별도다.

### 원격 설치 / 업데이트

개인용 SSH 방식을 유지한다. Node 22.12+, pnpm, Git, curl이 필요하다.

```bash
installer_dir="$(mktemp -d)"
curl -fsSL \
  'https://raw.githubusercontent.com/guite95/project-manager/main/scripts/install-flow-remote.mjs' \
  -o "$installer_dir/install.mjs" && node "$installer_dir/install.mjs" --ref main
rm -f "$installer_dir/install.mjs"
rmdir "$installer_dir"
```

공개 저장소는 HTTPS로 내려받으며, 서버 개인 SSH 인증은 별도로 필요하다.
설치 후 `~/.config/pm-flow/ssh.env`의 SSH 메타데이터를 채운다. 개인키/호스트 신뢰는
각 컴퓨터에서 준비한다. 자격증명을 배포 파일에 포함하지 않는다.
같은 명령을 반복하면 업데이트한다. ref를 커밋/태그로 고정할 수 있으며 이전 버전도 보관한다.
설치 경로는 `~/.local/share/pm-flow/releases/<commit>`, 진입점은 `current` 심볼릭 링크다.
`PM_FLOW_SSH_CONFIG`는 별도 SSH 설정 파일을 지정한다. 환경변수 > 개인 설정 > 개발 `.env` 순이다.
설치 자체는 DB 연결, 마이그레이션, 앱 배포를 수행하지 않는다.

설치기 테스트에서는 `PM_FLOW_INSTALL_HOME`, `PM_FLOW_SKILLS_DIR`로 임시 경로를 지정해
실제 HOME/CODEX_HOME이나 사용자 설치를 변경하지 않는다.

Claude Code에서도 `/pm-flow-author`, `/pm-flow-review`로 같은 스킬을 호출할 수 있다.
설치기 테스트의 `PM_FLOW_CLAUDE_SKILLS_DIR`는 Claude 스킬 경로를 임시 디렉터리로 분리한다.

## 프로젝트 녹음·전사

풀링 프로젝트의 `녹음·전사` 메뉴에서 녹음 종류와 상황 설명을 입력해 파일을 올릴 수 있습니다. 원본은 비공개 OCI, 전사본은 별도 DB 레코드로 저장하고 원본 파일과 TXT를 각각 다운로드합니다. Google Chirp 3가 기존 임베딩 ADC/WIF 인증을 재사용합니다. 별도 작업자 실행은 `pnpm recordings:worker`이며, 필요한 Google 권한·임시 버킷·DB migration·운영 구성은 [docs/recordings.md](docs/recordings.md)를 참고하세요.

## AI 세션·대화

`/ai-ops/activity`와 `/ai-ops/usage`에서 개인 AI 대화와 사용량을 확인합니다.
`pnpm ai:agent scan`으로 Mac의 수집 범위를 전송 없이 검사할 수 있습니다.
운영 반영 후 `pnpm ai:agent install`로 60초 간격 자동수집을 등록합니다.
수집 경로, 보관 정책, 설치·중지·검증 절차는 [docs/ai-ops.md](docs/ai-ops.md)를 참고하세요.
검색은 PostgreSQL FTS와 pgvector를 사용하며 Gemini Embedding 2·1536차원의 비동기 worker를 지원합니다. `pnpm ai:search inspect`로 준비 상태를 확인합니다. 선택적 pgvector 활성화·백필·재처리·검색 품질 평가는 [docs/ai-search.md](docs/ai-search.md)를 참고하세요.

개인 프로젝트는 `lib/personal-projects.ts`의 식별자로 풀링 프로젝트와 메뉴를 구분하고, 실제 프로젝트·자료는 기존 `flow_project`/`flow_document`, 기록은 `project_note`에 저장한다. `personal-` 식별자를 사용해 기존 프로젝트와 충돌하지 않는다. 각 프로젝트의 자료·기록·회의록은 `/flows/<personal-slug>/...`를 재사용하며 개인 탭을 유지한다. 디렉터리 변경은 자동 동기화하지 않는다. 초기 등록은 공유 DB 백업 후 `pnpm db:shared -- node --experimental-strip-types scripts/register-personal-projects.mjs inspect`로 확인하고 `apply`로 실행한다. 기존 행은 덮어쓰지 않는다. 작업 기록은 `/records/work-records`에서 조회하며, 이전 `/personal/work-records` 주소는 제거했다.
