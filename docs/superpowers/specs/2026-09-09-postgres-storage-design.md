# 서버 저장으로 이관 (PostgreSQL)

- 날짜: 2026-09-09
- 상태: 설계 승인됨 (구현 전)

## 목표

`오늘의 할 일`과 `명심할 점`은 지금 브라우저 `localStorage` 에만 저장된다.
그래서 같은 서버라도 브라우저·프로필·기기가 다르면 내용이 공유되지 않고,
브라우저 데이터를 지우면 사라진다.

두 화면의 데이터를 PostgreSQL 로 옮겨 어느 브라우저에서 열어도 같은 내용을
보게 한다. 함께 요청된 것이 하나 더 있다 — **날짜별 완료 항목 목록**. 지금은
`rollOverBoard` 가 날짜가 바뀔 때 완료 항목을 버려서 어제 무엇을 끝냈는지
남지 않는다.

### 전제

- 사용자는 한 명이다. 팀 공유나 권한 분리는 범위 밖이다.
- 배포 대상은 사용자의 OCI 인스턴스다. Docker Compose 로 앱 컨테이너를 띄우고,
  **PostgreSQL 은 그 인스턴스에 이미 떠 있는 컨테이너**를 그대로 쓴다.
- 로컬 개발 머신에도 PostgreSQL 이 이미 있다. 개발용 DB 컨테이너를 새로 만들지
  않는다.
- 배포본은 공개 인터넷에 노출된다. 비밀번호 한 겹으로 막는다.
- 외부 서비스 연동이 나중에 붙을 수 있다.

## 선택한 접근

**Prisma + Next.js REST 라우트 핸들러**, 그리고 **정규화한 테이블**.

기존 순수 함수(`lib/today-board.ts`, `lib/project-notes.ts`)는 그대로 둔다.
화면은 지금처럼 순수 함수로 클라이언트 상태를 즉시 바꿔 반응성을 유지하고,
같은 동작에 해당하는 엔드포인트를 이어서 호출한다. 요청이 실패하면 서버 상태를
다시 받아와 덮어쓴다. 화면 코드의 구조와 드래그 은유는 바뀌지 않는다.

검토한 다른 방식:

1. **Server Action 만 사용**: 코드가 가장 적다. 하지만 외부에서 호출할 창구가
   없어 연동을 붙일 때 결국 REST 를 다시 만들게 된다.
2. **`pg` 드라이버로 직접 SQL**: 의존성이 가볍다. 마이그레이션과 타입을 손으로
   관리해야 해서 이득보다 비용이 크다.
3. **보드 전체를 JSON 한 행에 저장**: 이관이 가장 쉽다. 날짜별 완료 목록을
   뽑기 어려워 이번 요구사항과 맞지 않는다.

정렬 순서와 접힘 상태는 테이블로 만들지 않는다. 혼자 쓰는 도구라 브라우저 간에
따라다니는 편이 편하므로 서버에 두되, 설정 행 하나에 JSON 으로 담는다.

## 데이터 모델

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// 화면에서 직접 추가한 프로젝트만 담는다.
/// 레지스트리(`lib/flows/registry.ts`) 프로젝트는 코드가 진실의 원천이므로 넣지 않는다.
model CustomProject {
  slug      String   @id
  title     String
  createdAt DateTime @map("created_at")

  @@map("custom_project")
}

/// 이슈 하나가 행 하나. 이슈 풀과 오늘 목록을 나누지 않고 placement 로 구분해
/// "한 항목은 한쪽에만 있다"는 기존 불변식을 컬럼으로 표현한다.
model Issue {
  id          String  @id
  /// 레지스트리·커스텀 어느 쪽에도 없는 값이면 화면에서 미분류로 묶인다.
  /// 그래서 외래키를 걸지 않는다.
  projectSlug String  @map("project_slug")
  title       String
  createdAt   DateTime @map("created_at")
  /// "pool" | "today"
  placement   String
  /// placement 가 "today" 일 때만 값이 있다. 로컬 기준 YYYY-MM-DD.
  todayDate   String? @map("today_date")
  done        Boolean @default(false)
  position    Int

  completions Completion[]

  @@index([placement, position])
  @@map("issue")
}

/// 완료 이력. 제목과 프로젝트를 복사해 두어 원본 이슈를 지워도 이력이 남는다.
model Completion {
  id          String   @id
  issueId     String?  @map("issue_id")
  issue       Issue?   @relation(fields: [issueId], references: [id], onDelete: SetNull)
  projectSlug String   @map("project_slug")
  title       String
  /// 완료한 날. 로컬 기준 YYYY-MM-DD.
  completedOn String   @map("completed_on")
  completedAt DateTime @map("completed_at")

  @@index([completedOn])
  @@map("completion")
}

model ProjectNote {
  id          String   @id
  projectSlug String   @map("project_slug")
  content     String
  /// "urgent" | "high" | "normal" | "low"
  priority    String
  position    Int
  updatedAt   DateTime @map("updated_at")

  @@index([projectSlug, position])
  @@map("project_note")
}

/// 화면 상태를 담는 키-값 행. 현재 키는 "board" 하나이며
/// { projectOrder: string[], collapsedProjects: string[] } 를 담는다.
model AppSetting {
  key   String @id
  value Json

  @@map("app_setting")
}
```

날짜를 `Date` 가 아니라 `YYYY-MM-DD` 문자열로 둔다. 기존 `todayDateString` 이
로컬 기준 문자열을 쓰고 있고, 시간대 변환이 끼어들 여지를 없애기 위해서다.

정렬은 `position` 정수로 둔다. **자신이 속한 목록 안에서의 순서**를 뜻한다.
`placement` 가 `pool` 이면 그 프로젝트 그룹 안에서의 순서, `today` 면 오늘
목록 안에서의 순서다. 항목이 목록을 옮기면 도착한 목록의 맨 뒤 값을 받는다.
드래그로 순서를 바꾸면 그 목록의 항목에 0부터 새로 매겨 보낸다. 항목 수가
적어 재계산 비용이 문제되지 않는다.

## 롤오버와 완료 이력 규칙

`lib/today-board.ts` 에 순수 함수로 두고 `.test.mjs` 로 검증한다.

**완료 이력은 체크하는 순간 쌓는다.** 롤오버 시점이 아니다. 자정을 넘겨 며칠
열지 않아도 완료 날짜가 정확히 남는다. 체크를 풀면 그 이력을 지운다.

- 체크: `completion` 행을 만든다. `completedOn` 은 그 시점의 로컬 날짜다.
- 체크 해제: 해당 `issueId` 와 `completedOn` 이 맞는 행을 지운다.

**롤오버는 보드를 읽을 때 서버에서 수행한다.** 보드 전체의 날짜 하나가 아니라
항목마다 붙은 `todayDate` 를 본다. 며칠 만에 열어도 항목별 판정이 정확하다.

`placement = "today"` 이고 `todayDate` 가 오늘보다 이전인 항목을 이렇게 처리한다.

| 상태 | 처리 |
| --- | --- |
| `done = true` | 이슈 행을 지운다. 이력은 `completion` 에 이미 있다. |
| `done = false` | `placement = "pool"`, `todayDate = null` 로 되돌린다. |

기존 `rollOverBoard` 는 이 규칙으로 대체된다. `TodayBoard.date` 필드는 없어진다.

## API

전부 `app/api/` 아래 라우트 핸들러다. 외부 서비스가 나중에 붙을 자리라서
동작 단위로 잘게 연다.

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| GET | `/api/board` | 롤오버를 수행하고 이슈·오늘 목록·커스텀 프로젝트·설정을 반환 |
| POST | `/api/issues` | 이슈 추가 |
| PATCH | `/api/issues/[id]` | `placement` 와 `done` 변경 |
| DELETE | `/api/issues/[id]` | 이슈 삭제 |
| PUT | `/api/issues/order` | 한 목록의 `position` 재배치 |
| POST | `/api/projects` | 커스텀 프로젝트 추가 |
| DELETE | `/api/projects/[slug]` | 커스텀 프로젝트 삭제, 이슈는 그대로 둔다 |
| GET | `/api/notes/[project]` | 명심할 점 목록 |
| POST | `/api/notes/[project]` | 명심할 점 추가 |
| PATCH | `/api/notes/[id]` | 내용·우선순위 변경 |
| DELETE | `/api/notes/[id]` | 삭제 |
| PUT | `/api/notes/[project]/order` | 순서 재배치 |
| GET | `/api/history?from=&to=` | 날짜별 완료 목록 |
| PUT | `/api/settings` | 정렬 순서·접힘 상태 저장 |
| POST | `/api/import` | localStorage 값 일괄 이관. 서버가 비어 있지 않으면 409 로 거절 |

`PATCH /api/issues/[id]` 에서 `done` 이 바뀌면 `completion` 생성·삭제를 같은
트랜잭션에서 처리한다.

Prisma 클라이언트는 `lib/db.ts` 에서 전역 싱글턴으로 만든다. 개발 중 핫리로드가
연결을 계속 새로 열지 않게 하기 위해서다.

## 인증

비밀번호를 코드에 적지 않는다. **환경변수에 해시만 둔다.**

- 비밀번호 해시는 Node 내장 `crypto.scrypt` 로 만든다. 새 의존성이 없다.
- 세션 쿠키 서명은 표준 Web Crypto 의 HMAC-SHA256 으로 한다. 미들웨어에서도
  같은 코드가 돌아야 하기 때문이다. 비밀번호 해시 코드와 파일을 나눈다.
- `scripts/hash-password.mjs` 를 둔다. 비밀번호를 정하거나 바꿀 때 직접 돌려
  나온 값을 환경변수에 넣는다. 스크립트는 입력을 화면에 표시하지 않는다.
- 대조는 `crypto.timingSafeEqual` 로 한다.

| 환경변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `APP_PASSWORD_HASH` | `salt:hash` 형식의 scrypt 결과 |
| `SESSION_SECRET` | 세션 쿠키 서명 키 |

흐름은 이렇다.

1. `/login` 화면에서 비밀번호를 받는다.
2. `POST /api/login` 이 해시를 대조한다.
3. 성공하면 서명한 HttpOnly·SameSite=Lax 쿠키를 내린다. 만료는 30일이다.
4. `middleware.ts` 가 `/login` 과 `/api/login` 만 열어 두고 나머지를 막는다.

미들웨어에 API 토큰 검사 자리를 함께 남긴다. 외부 연동을 붙일 때 `Authorization`
헤더를 보는 분기만 채우면 되게 한다. 이번 범위에서는 토큰을 발급하지 않는다.

## 데이터 이관

첫 로드 때 한 번만 일어난다.

1. `GET /api/board` 결과가 완전히 비어 있는지 본다. 이슈·오늘 목록·커스텀
   프로젝트·명심할 점이 모두 없을 때만 이관 대상이다.
2. 브라우저의 `project-management.today-board.v1` 과
   `project-management.project-notes.v1:<slug>` 키를 모두 읽는다.
3. 값이 있으면 `POST /api/import` 로 한 번에 올린다.
4. 성공하면 그 키들을 `localStorage` 에서 지운다. 중복 업로드를 막기 위해서다.

완료 이력은 지금 저장된 적이 없으므로 이관 대상이 아니다. 이력은 이관 이후
체크하는 것부터 쌓인다.

사이드바 접힘 상태와 ERP 표 컬럼 설정은 화면을 보는 사람의 취향이므로
`localStorage` 에 그대로 둔다. 이관 대상이 아니다.

## 이력 화면

`/today/history` 를 새로 만든다.

- 날짜를 최신순으로 놓고, 각 날짜 아래에 완료 항목을 프로젝트별로 묶는다.
- 묶는 순서와 미분류 처리는 `groupIssuesByProject` 를 그대로 쓴다. 오늘의 할 일
  화면과 순서가 어긋나지 않게 하기 위해서다.
- 기본 범위는 최근 30일이다. `더 보기` 로 30일씩 과거로 넘긴다.
- 완료 항목이 없는 날은 표시하지 않는다.
- 오늘의 할 일 화면 헤더에 이 페이지로 가는 링크를 둔다.

색과 간격은 `app/globals.css` 의 `--bi-*` 토큰만 쓴다.

## 배포

`next.config.ts` 에 `output: "standalone"` 을 더해 이미지를 가볍게 한다.

`Dockerfile` 은 의존성 설치·빌드·실행을 나눈 다단계 빌드로 둔다.
`docker-compose.yml` 은 **앱 서비스 하나만** 정의한다. PostgreSQL 서비스를 새로
쓰지 않고, 이미 떠 있는 컨테이너의 네트워크에 `external` 로 붙인다. 접속 정보는
환경변수로 넘긴다.

마이그레이션은 컨테이너 시작 시 `prisma migrate deploy` 로 적용한다.

## 테스트

지금 쓰는 `node:test` 를 그대로 쓴다. 새 러너를 들이지 않는다.

- 롤오버 판정과 완료 이력 생성·삭제 규칙을 순수 함수로 떼어
  `lib/today-board.test.mjs` 에 이어서 검증한다. 날짜와 id 는 호출부가 넘겨
  테스트가 결정적이도록 지금 규약을 유지한다.
- 세션 쿠키 서명·검증과 비밀번호 해시 대조를 `lib/auth.test.mjs` 로 검증한다.
- DB 를 만지는 코드는 로컬 PostgreSQL 을 상대로 통합 테스트한다. `TEST_DATABASE_URL`
  로 지정한 별도 데이터베이스를 쓰고, 각 테스트 앞에서 테이블을 비워 서로
  간섭하지 않게 한다.

`package.json` 에 `test` 스크립트를 추가한다.

## 구현 순서

한 번에 전부 바꾸면 중간 상태에서 앱이 동작하지 않는다. 이 순서로 나눈다.

1. Prisma 도입, 스키마와 첫 마이그레이션, `lib/db.ts`.
2. 인증. 해시 스크립트, 로그인 화면, 미들웨어.
3. 오늘의 할 일 API 와 화면 연결. 롤오버·완료 이력 규칙 포함.
4. 명심할 점 API 와 화면 연결.
5. 이관. `POST /api/import` 와 첫 로드 훅.
6. 이력 화면.
7. 배포 구성. Dockerfile, compose, standalone 출력.

각 단계가 끝날 때 앱은 동작하는 상태여야 한다.

## 범위 밖

- 사용자 계정, 가입, 비밀번호 찾기. 비밀번호 한 겹만 둔다.
- 외부 서비스 연동 자체. 토큰 검사 자리만 남긴다.
- 실시간 동기화. 다른 탭에서 바꾼 내용은 새로고침해야 보인다.
- 사이드바 접힘 상태와 ERP 표 컬럼 설정의 서버 이관.
- 완료 이력의 편집과 삭제. 이력은 체크·해제로만 바뀐다.
