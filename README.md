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
pnpm dev          # http://localhost:30001
pnpm build        # 프로덕션 빌드
pnpm typecheck    # tsc --noEmit
pnpm test         # node --test
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
| `/flows/[project]/notes` | 프로젝트별 명심할 점 — 4단계 우선순위와 서버 자동 저장 |
| `/guide` | 플로우차트 작성 가이드 (MDX) |

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
  project-notes/         프로젝트별 명심할 점 편집 표
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
  shell/                 헤더 + 3단 트리 사이드바(검색)
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
  registry.ts            프로젝트 → 카테고리 → 차트 트리의 단일 소스
  <slug>.ts              플로우차트 데이터 ← 새 차트는 여기만 작성
scripts/
  hash-password.mjs      APP_PASSWORD_HASH 만들기
```

`lib` 안에서 값을 가져올 때는 상대 경로에 `.ts` 확장자를 붙인다. `@/` 별칭은
tsconfig 만 아는 것이라 `node --test` 가 `.ts` 를 직접 읽을 때 해석하지 못한다.
타입만 가져올 때는 컴파일에서 지워지므로 `@/` 를 써도 된다.

## 새 플로우차트 추가

1. `lib/flows/<slug>.ts` 에 `FlowChart` 선언 (기존 파일 복사 권장)
2. `lib/flows/registry.ts` 의 `flowProjects` 에서 알맞은 프로젝트/카테고리에 등록

그 외 등록 절차는 없다. 사이드바·목록·라우트가 전부 레지스트리에서 파생된다.
자세한 규약은 `/guide` 참고.
