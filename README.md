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
방식을 그대로 따왔다. 핵심은 **좌표를 데이터에 넣지 않고 Dagre 에 위임**하는 것.

## 환경변수

`.env.example` 을 `.env` 로 복사해 채운다. `.env` 는 커밋하지 않는다.

| 이름 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `TEST_DATABASE_URL` | 통합 테스트용 별도 데이터베이스 |
| `APP_PASSWORD_HASH` | `node scripts/hash-password.mjs` 결과 |
| `SESSION_SECRET` | `openssl rand -hex 32` 결과 |
| `REQUIRE_LOGIN` | 개발 환경에서도 로그인을 강제할 때 `1`. 선택 |

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

**개발 환경에서는 비밀번호를 묻지 않는다.** 프로덕션 빌드에서는 항상 묻는다.
로그인 흐름 자체를 확인하려면 `REQUIRE_LOGIN=1 pnpm dev` 로 켠다.

배포는 `docs/deploy.md` 를 본다.

## 라우트

| 경로 | 내용 |
| --- | --- |
| `/login` | 비밀번호 한 겹. 프로덕션 빌드에서만 막는다 |
| `/today` | 오늘의 할 일 — 프로젝트별 이슈를 끌어다 놓고 체크, 날짜가 바뀌면 자동 정리 |
| `/today/history` | 날짜별 완료 이력 — 체크한 순간의 날짜로 쌓인다 |
| `/flows` | 전체 목록 — 프로젝트 → 카테고리 → 차트 |
| `/flows/[project]?cat=&chart=` | 프로젝트 화면 — 쿼리파람으로 차트 전환, 잘못된 값은 첫 차트 폴백 |
| `/flows/common/notes` | 명심할 점 — 4단계 우선순위와 서버 자동 저장. 공통 프로젝트에만 있다 |
| `/guide` | 플로우차트 작성 가이드 (MDX) |

## 2단 사이드바와 공유 화면 설정

데스크톱에서는 60px 주 메뉴와 235px 상세 메뉴를 사용한다. 주 메뉴는 오늘의 할 일,
프로젝트, 작성 가이드로 나뉜다. 상세 메뉴를 접어도 주 메뉴는 남으며, 모바일에서는
상단 메뉴 버튼으로 전체 메뉴와 각 영역의 상세 메뉴를 탐색한다.

프로젝트 상세 메뉴는 프로젝트 → 카테고리까지만 표시하고, 개별 차트는 본문 상단
선택기에서 제목·설명·종류(차트/ERD)를 보고 선택한다. 검색 중에는 프로젝트명,
카테고리명, 차트 제목·설명과 명심할 점·외부 링크까지 검색하며 차트로 바로 이동한다.

화면 설정은 로컬·배포 앱이 사용하는 공유 PostgreSQL의 `app_setting`에 저장한다.

| 키 | 저장 내용 |
| --- | --- |
| `sidebar:project-order` | 사이드바 프로젝트 순서 |
| `ui:navigation` | 상세 메뉴 접힘, 프로젝트별 펼침·접힘 |
| `ui:reference-columns` | UI 레퍼런스 표의 컬럼 표시·순서·너비 |
| `board` | 기존 오늘의 할 일 보드 설정 |

`GET/PATCH /api/ui-settings/navigation`, `GET/PATCH /api/ui-settings/reference-columns`는
허용된 설정만 읽고 저장한다. PATCH는 `{ changes: { ... } }` 형식이며 변경한 항목만
비교 후 갱신하여 다른 브라우저의 별도 설정 변경을 보존한다. 예를 들어
`{ "changes": { "panelCollapsed": true, "project:tns": false } }`로 저장한다.
조회는 DB를 변경하지 않고, 최초 변경 때 설정 키를 생성하므로 스키마 마이그레이션은 없다.

새 UI 설정은 새로고침·창 복귀와 화면이 보이는 동안 15초 간격으로 동기화한다.
저장 실패는 화면에 알리고 마지막으로 확인한 값으로 복구한다. 기존 브라우저의
사이드바·컬럼 설정은 공유 키가 없을 때만 최초 이관하며, 공유 값이 있으면 우선한다.
예전 localStorage 값은 보존하지만 이후 설정 저장에는 사용하지 않는다.
검색어, 모바일 메뉴의 일시적인 열림, 현재 차트 URL은 영구 설정에 포함하지 않는다.

### 사이드바 프로젝트 순서

프로젝트 제목 오른쪽 손잡이를 드래그해 프로젝트 단위로 순서를 바꾼다.
손잡이에 키보드 포커스를 두고 `↑`·`↓`를 눌러도 이동한다.
공통·고객사·외부 링크 프로젝트를 같은 목록에서 옮기며 하위 메뉴는 함께 이동한다.
검색 중에는 순서 변경을 막고, 저장 실패 시 이전 순서로 돌아가 오류를 표시한다.

순서는 `app_setting`의 `sidebar:project-order`에 저장한다.
`GET/PUT /api/sidebar/order`와 앱 셸이 같은 값을 읽으므로, 이 기능이 배포된
로컬·원격 앱은 새로고침 시 같은 순서를 표시한다. 오늘의 할 일 보드 순서와
사이드바 펼침·접힘 설정은 각각의 DB 설정 키로 유지한다.

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
  today/                 오늘의 할 일 · 완료 이력
  flows/                 목록 · 차트 상세 · 프로젝트 명심할 점 라우트
  guide/page.mdx         작성 가이드
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

현재 차트의 원천은 PostgreSQL이다. `flow_project`와 `flow_category`가 순서와 메뉴 정보를,
`flow_document.document` JSONB가 차트 한 장의 `nodes`, `edges`, `groups`, 설명과 배치 방향을 담는다.
`app_setting`의 `erd:tns` 값은 ERD 상세/드릴다운에 쓰는 전체 스키마 스냅샷이다.
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
