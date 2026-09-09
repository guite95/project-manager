# 서버 저장(PostgreSQL) 이관 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오늘의 할 일과 명심할 점을 브라우저 `localStorage` 에서 PostgreSQL 로 옮기고, 날짜별 완료 이력을 남기는 화면을 더한다.

**Architecture:** Prisma 로 정규화한 테이블을 두고 Next.js 라우트 핸들러로 REST 를 연다. 기존 순수 함수와 드래그 은유는 그대로 두고, 화면은 순수 함수로 상태를 먼저 바꾼 뒤 같은 동작의 엔드포인트를 호출한다. 요청이 실패하면 서버 상태를 다시 받아 덮어쓴다. 비밀번호 한 겹으로 전체를 막는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma + PostgreSQL, Tailwind v4 (`--bi-*` 토큰), `react-icons` (Heroicons v1 아웃라인), `node:test`

**Spec:** `docs/superpowers/specs/2026-09-09-postgres-storage-design.md`

## Global Constraints

- **커밋 메시지에 `Co-Authored-By` 트레일러를 넣지 않는다.** 사용자 전역 규칙이다.
- 사용자에게 보이는 문구는 전부 한국어다. 코드 식별자와 파일명은 영어다.
- 색과 간격은 `app/globals.css` 에 이미 있는 `--bi-*` 토큰만 쓴다. 새 토큰을 추가하지 않는다.
- 새 npm 의존성은 Prisma 한 묶음뿐이다: `@prisma/client`, `@prisma/adapter-pg`,
  `pg` 와 개발용 `prisma`, `@types/pg`. Prisma 7 은 쿼리 컴파일러를 쓰므로
  드라이버 어댑터가 필수다. 그 밖의 패키지를 추가하지 않는다. 비밀번호 해시와
  서명은 런타임 내장 기능으로 한다.
- 날짜 문자열은 로컬 시간 기준 `YYYY-MM-DD` 다. UTC 로 계산하지 않는다. 기존 `todayDateString` 을 그대로 쓴다.
- 순수 함수는 입력을 변형하지 않고 새 값을 반환한다. `id` 와 `now` 는 호출부가 넘긴다. 테스트가 결정적이어야 한다.
- 비밀번호와 서명 키를 코드에 적지 않는다. 환경변수로만 받는다.
- 테스트는 `node --test` 로 돌린다. 새 테스트 러너를 들이지 않는다.
- 드래그로 되는 모든 동작에 버튼 경로가 함께 있어야 한다. 기존 규칙이다.
- 각 태스크가 끝날 때 `pnpm typecheck` 와 `pnpm test` 가 통과해야 한다.

## 환경변수

| 이름 | 용도 | 어디서 쓰나 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 | 앱 런타임, 마이그레이션 |
| `TEST_DATABASE_URL` | 통합 테스트용 별도 데이터베이스 | 테스트만 |
| `APP_PASSWORD_HASH` | `salt:hash` 형식의 scrypt 결과 | 로그인 라우트 |
| `SESSION_SECRET` | 세션 쿠키 서명 키 | 로그인 라우트, `proxy.ts` |

## File Structure

**새로 만드는 파일**

| 경로 | 책임 |
| --- | --- |
| `prisma/schema.prisma` | 테이블 정의 |
| `prisma.config.ts` | Prisma CLI 설정. 접속 URL 과 스키마 경로 |
| `lib/db.ts` | Prisma 클라이언트 싱글턴 (pg 어댑터) |
| `lib/session.ts` | 세션 토큰 생성·검증. Web Crypto HMAC 이라 `proxy.ts` 에서도 돈다 |
| `lib/password.ts` | 비밀번호 해시·대조 (`node:crypto` scrypt) |
| `lib/rollover.ts` | 롤오버 판정 순수 함수 |
| `lib/completions.ts` | 완료 이력 타입과 날짜별 묶기 순수 함수 |
| `lib/server/board-store.ts` | 보드 관련 DB 접근 |
| `lib/server/notes-store.ts` | 명심할 점 DB 접근 |
| `lib/server/history-store.ts` | 완료 이력 DB 접근 |
| `lib/api-client.ts` | 화면이 쓰는 fetch 래퍼 |
| `proxy.ts` | 세션 검사. Next 16 은 `middleware` 대신 `proxy` 규약을 쓴다 |
| `scripts/hash-password.mjs` | 해시 생성 CLI |
| `app/login/page.tsx` | 로그인 화면 |
| `app/api/**` | 라우트 핸들러 |
| `app/today/history/page.tsx` | 이력 화면 |
| `components/today-board/completion-history.tsx` | 이력 표시 컴포넌트 |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | 배포 |

**고치는 파일**

| 경로 | 무엇을 |
| --- | --- |
| `lib/today-board.ts` | `TodayBoard.date` 제거, `rollOverBoard` 제거, `normalizeTodayBoard` 조정 |
| `components/today-board/today-board.tsx` | `localStorage` 대신 API 호출 |
| `components/today-board/today-list.tsx` | `date` prop 을 바깥에서 받도록 유지 |
| `components/project-notes/project-notes-table.tsx` | `localStorage` 대신 API 호출, 내용 입력은 디바운스 |
| `next.config.ts` | `output: "standalone"` |
| `package.json` | `test` 스크립트, Prisma 의존성 |
| `app/today/page.tsx` | 안내 문구 수정, 이력 링크 |

---

### Task 1: Prisma 도입과 스키마

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db.ts`
- Create: `.env.example`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `prisma` — `lib/db.ts` 가 내보내는 `PrismaClient` 싱글턴
  - Prisma 모델: `CustomProject`, `Issue`, `Completion`, `ProjectNote`, `AppSetting`

- [ ] **Step 1: 의존성 설치**

```bash
pnpm add @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg
pnpm add -D prisma@7.10.0 @types/pg
```

**버전을 반드시 고정한다.** 태그만 쓰면 `prisma` 가 8 릴리스 후보로 잡혀
`@prisma/client` 와 메이저가 어긋난다.

`pnpm-workspace.yaml` 의 `allowBuilds` 에 다음을 넣어야 엔진이 설치된다.

```yaml
allowBuilds:
  '@prisma/engines': true
  prisma: true
```

- [ ] **Step 2: 스키마 작성**

`prisma/schema.prisma`:

Prisma 7 은 `url` 을 스키마에 두지 않는다. `prisma.config.ts` 로 옮긴다.

```prisma
generator client {
  provider = "prisma-client-js"
}

// 접속 URL 은 prisma.config.ts 에 있다. Prisma 7 부터 스키마에 두지 않는다.
datasource db {
  provider = "postgresql"
}

/// 화면에서 직접 추가한 프로젝트만 담는다.
/// 레지스트리(lib/flows/registry.ts) 프로젝트는 코드가 진실의 원천이므로 넣지 않는다.
model CustomProject {
  slug      String   @id
  title     String
  createdAt DateTime @map("created_at")

  @@map("custom_project")
}

/// 이슈 하나가 행 하나. 이슈 풀과 오늘 목록을 나누지 않고 placement 로 구분해
/// "한 항목은 한쪽에만 있다"는 기존 불변식을 컬럼으로 표현한다.
model Issue {
  id          String   @id
  /// 레지스트리에도 커스텀에도 없는 값이면 화면에서 미분류로 묶인다. 외래키를 걸지 않는다.
  projectSlug String   @map("project_slug")
  title       String
  createdAt   DateTime @map("created_at")
  /// "pool" | "today"
  placement   String
  /// placement 가 "today" 일 때만 값이 있다. 로컬 기준 YYYY-MM-DD.
  todayDate   String?  @map("today_date")
  done        Boolean  @default(false)
  /// 자신이 속한 목록 안에서의 순서.
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

- [ ] **Step 3: Prisma CLI 설정**

Prisma 7 은 `.env` 를 알아서 읽지 않는다. Node 내장 `process.loadEnvFile` 로 읽는다.

`prisma.config.ts` (저장소 루트):

```ts
/**
 * Prisma 7 부터 접속 URL 은 스키마가 아니라 여기에 둔다.
 * 런타임 클라이언트는 `lib/db.ts` 에서 드라이버 어댑터로 따로 연결한다.
 * 이 파일은 migrate·introspect 같은 CLI 명령이 쓴다.
 */
import { defineConfig, env } from "prisma/config";

// Prisma 7 은 .env 를 알아서 읽지 않는다. Node 내장 기능으로 읽는다.
// 컨테이너처럼 파일 없이 환경변수만 주는 곳도 있으므로 없으면 그냥 넘어간다.
try {
  process.loadEnvFile(".env");
} catch {
  // 파일이 없으면 이미 환경에 들어있는 값을 쓴다.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

- [ ] **Step 3b: Prisma 클라이언트 싱글턴**

`lib/db.ts`:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma 7 은 쿼리 컴파일러를 쓰므로 Rust 엔진 대신 드라이버 어댑터로 붙는다.
 * `pg` 는 순수 자바스크립트라 컨테이너 이미지에 네이티브 바이너리가 들어가지 않는다.
 *
 * 개발 중 핫리로드가 연결을 계속 새로 열지 않도록 전역에 하나만 둔다.
 * 프로덕션은 프로세스가 하나뿐이라 전역에 붙이지 않는다.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 이 없습니다. .env 를 확인하세요.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: 환경변수 예시와 무시 규칙**

`.env.example`:

```
# 로컬 개발용. 사용자 이름과 비밀번호는 각자 환경에 맞춘다.
DATABASE_URL="postgresql://USER@localhost:5432/project_management"
TEST_DATABASE_URL="postgresql://USER@localhost:5432/project_management_test"
# node scripts/hash-password.mjs 결과
APP_PASSWORD_HASH=""
# openssl rand -hex 32 결과
SESSION_SECRET=""
```

Homebrew 로 깐 PostgreSQL 은 기본 사용자가 OS 계정 이름이다. `whoami` 결과를
`USER` 자리에 넣는다. 사용자를 빼면 `P1010: User was denied access` 가 난다.

`.gitignore` 에 다음 줄이 없으면 더한다.

```
.env
.env.local
```

- [ ] **Step 5: 스크립트 추가**

`package.json` 의 `scripts` 에 더한다.

```json
"test": "node --env-file-if-exists=.env --test \"lib/**/*.test.mjs\"",
"db:migrate": "prisma migrate dev",
"db:deploy": "prisma migrate deploy",
"db:generate": "prisma generate"
```

- [ ] **Step 6: 마이그레이션 생성과 적용**

로컬 PostgreSQL 에 `project_management` 와 `project_management_test` 데이터베이스가 있어야 한다. 없으면 만든다.

```bash
createdb project_management
createdb project_management_test
```

`.env` 에 `.env.example` 내용을 복사해 채운 뒤:

```bash
pnpm db:migrate --name init
```

Expected: `prisma/migrations/<타임스탬프>_init/migration.sql` 이 생기고 테이블 다섯 개가 만들어진다.

- [ ] **Step 7: 타입 검사**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 8: 커밋**

```bash
git add prisma prisma.config.ts lib/db.ts .env.example .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: Prisma 스키마와 클라이언트 싱글턴 추가"
```

---

### Task 2: 비밀번호 해시와 세션 토큰

**Files:**
- Create: `lib/password.ts`
- Create: `lib/password.test.mjs`
- Create: `lib/session.ts`
- Create: `lib/session.test.mjs`
- Create: `scripts/hash-password.mjs`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `hashPassword(password: string, salt?: string): Promise<string>` — `"salt:hash"` 16진 문자열
  - `verifyPassword(password: string, stored: string): Promise<boolean>`
  - `createSessionToken(secret: string, expiresAt: number): Promise<string>` — `"만료시각.서명"`
  - `isSessionTokenValid(token: string, secret: string, now: number): Promise<boolean>`
  - `SESSION_COOKIE_NAME: string` — `"pm_session"`
  - `SESSION_MAX_AGE_SECONDS: number` — 30일

두 파일을 나누는 이유: 세션 검증은 `proxy.ts` 에서도 돌아야 해서 표준 Web Crypto 만 쓴다. 비밀번호 해시는 `node:crypto` 의 `scrypt` 를 쓰며 라우트 핸들러와 CLI 에서만 쓴다.

- [ ] **Step 1: 비밀번호 테스트를 먼저 쓴다**

`lib/password.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

const { hashPassword, verifyPassword } = await import("./password.ts");

test("같은 비밀번호는 자기 해시와 대조된다", async () => {
  const stored = await hashPassword("열려라참깨");
  assert.equal(await verifyPassword("열려라참깨", stored), true);
});

test("다른 비밀번호는 대조에 실패한다", async () => {
  const stored = await hashPassword("열려라참깨");
  assert.equal(await verifyPassword("안열려", stored), false);
});

test("같은 비밀번호라도 salt 가 달라 해시가 매번 다르다", async () => {
  const a = await hashPassword("열려라참깨");
  const b = await hashPassword("열려라참깨");
  assert.notEqual(a, b);
});

test("형식이 어긋난 저장값은 던지지 않고 false 를 준다", async () => {
  assert.equal(await verifyPassword("열려라참깨", "쓰레기"), false);
  assert.equal(await verifyPassword("열려라참깨", ""), false);
  assert.equal(await verifyPassword("열려라참깨", "aa:"), false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test lib/password.test.mjs`
Expected: FAIL — `./password.ts` 를 찾을 수 없다

- [ ] **Step 3: 비밀번호 모듈 구현**

`lib/password.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** `salt:hash` 형태의 16진 문자열을 만든다. salt 를 넘기면 그 값을 쓴다 (테스트용). */
export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
): Promise<string> {
  const key = await derive(password, Buffer.from(salt, "hex"));
  return `${salt}:${key.toString("hex")}`;
}

/** 저장값 형식이 어긋나도 던지지 않는다. 로그인 실패와 같게 다룬다. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;

  let expectedBuffer: Buffer;
  try {
    expectedBuffer = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (expectedBuffer.length !== KEY_LENGTH) return false;

  const actual = await derive(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(actual, expectedBuffer);
}
```

- [ ] **Step 4: 비밀번호 테스트 통과 확인**

Run: `node --test lib/password.test.mjs`
Expected: PASS

- [ ] **Step 5: 세션 테스트를 먼저 쓴다**

`lib/session.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

const { createSessionToken, isSessionTokenValid } = await import("./session.ts");

const SECRET = "테스트-서명키";
const NOW = 1_757_000_000_000;

test("만료 전 토큰은 유효하다", async () => {
  const token = await createSessionToken(SECRET, NOW + 1000);
  assert.equal(await isSessionTokenValid(token, SECRET, NOW), true);
});

test("만료된 토큰은 무효다", async () => {
  const token = await createSessionToken(SECRET, NOW - 1);
  assert.equal(await isSessionTokenValid(token, SECRET, NOW), false);
});

test("다른 키로 만든 토큰은 무효다", async () => {
  const token = await createSessionToken("다른키", NOW + 1000);
  assert.equal(await isSessionTokenValid(token, SECRET, NOW), false);
});

test("만료 시각만 바꿔치기하면 서명이 어긋나 무효다", async () => {
  const token = await createSessionToken(SECRET, NOW + 1000);
  const [, signature] = token.split(".");
  const forged = `${NOW + 999_999}.${signature}`;
  assert.equal(await isSessionTokenValid(forged, SECRET, NOW), false);
});

test("형식이 어긋난 토큰은 던지지 않고 무효다", async () => {
  for (const bad of ["", "쓰레기", "abc.def", ".", "123."]) {
    assert.equal(await isSessionTokenValid(bad, SECRET, NOW), false);
  }
});
```

- [ ] **Step 6: 세션 테스트가 실패하는지 확인**

Run: `node --test lib/session.test.mjs`
Expected: FAIL — `./session.ts` 를 찾을 수 없다

- [ ] **Step 7: 세션 모듈 구현**

`lib/session.ts`:

```ts
/**
 * 세션 토큰은 `만료시각.서명` 이다. 서명은 만료시각 문자열에 대한 HMAC-SHA256.
 *
 * `proxy.ts` 에서도 그대로 돌아야 하므로 `node:crypto` 가 아니라 표준 Web Crypto 만
 * 쓴다. 비밀번호 해시는 `lib/password.ts` 에 따로 있다.
 */

export const SESSION_COOKIE_NAME = "pm_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/** 길이가 달라도 이른 반환으로 정보를 흘리지 않게 고정 시간 비교를 흉내낸다. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  secret: string,
  expiresAt: number,
): Promise<string> {
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload, secret)}`;
}

/** 형식이 어긋나거나 서명이 맞지 않거나 만료됐으면 false. 절대 던지지 않는다. */
export async function isSessionTokenValid(
  token: string,
  secret: string,
  now: number,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isSafeInteger(expiresAt)) return false;

  if (!safeEqual(await sign(payload, secret), signature)) return false;
  return expiresAt > now;
}
```

- [ ] **Step 8: 세션 테스트 통과 확인**

Run: `node --test lib/session.test.mjs`
Expected: PASS

- [ ] **Step 9: 해시 생성 CLI**

`scripts/hash-password.mjs`:

```js
/**
 * 비밀번호 해시를 만든다. 나온 값을 APP_PASSWORD_HASH 환경변수에 넣는다.
 *
 *   node scripts/hash-password.mjs
 *
 * 터미널에서 돌리면 입력한 글자가 화면에 보이지 않는다. 인자로 받지 않는 이유는
 * 셸 히스토리에 비밀번호가 남기 때문이다.
 */
import { createInterface } from "node:readline";
import { hashPassword } from "../lib/password.ts";

const isTty = process.stdin.isTTY === true;

// 인터페이스를 하나만 만든다. 중간에 닫으면 stdin 이 끊겨 다음 질문을 받지 못한다.
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: isTty,
});

let muted = false;
const write = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (chunk) => {
  if (!muted) write?.(chunk);
};

// 비동기 이터레이터는 줄 사이에 스트림을 멈춰 준다. `rl.question` 을 두 번 쓰면
// 파이프로 들어온 둘째 줄이 대기자가 없는 사이에 흘러가 버린다.
const lines = rl[Symbol.asyncIterator]();

async function ask(question) {
  process.stdout.write(question);
  muted = isTty;
  const { value, done } = await lines.next();
  muted = false;
  if (isTty) process.stdout.write("\n");
  return done ? "" : value;
}

try {
  const password = (await ask("새 비밀번호: ")).trim();
  if (!password) {
    console.error("비밀번호가 비어 있습니다.");
    process.exit(1);
  }

  const again = (await ask("한 번 더: ")).trim();
  if (password !== again) {
    console.error("두 입력이 다릅니다.");
    process.exit(1);
  }

  console.log("\nAPP_PASSWORD_HASH 에 아래 값을 넣으세요.\n");
  console.log(await hashPassword(password));
} finally {
  rl.close();
}
```

- [ ] **Step 10: CLI 동작 확인**

세 경로를 모두 확인한다.

```bash
printf 'testpw\ntestpw\n' | node --no-warnings scripts/hash-password.mjs
printf 'aaa\nbbb\n'       | node --no-warnings scripts/hash-password.mjs
printf '\n'               | node --no-warnings scripts/hash-password.mjs
```

Expected: 차례로 `salt:hash` 형식의 긴 16진 문자열, "두 입력이 다릅니다.",
"비밀번호가 비어 있습니다." 가 나온다. 뒤의 두 경우는 종료 코드가 1 이다.

터미널에서 직접 돌리면 입력한 글자가 화면에 보이지 않는다.

- [ ] **Step 11: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck`
Expected: 모두 통과

- [ ] **Step 12: 커밋**

```bash
git add lib/password.ts lib/password.test.mjs lib/session.ts lib/session.test.mjs scripts/hash-password.mjs
git commit -m "feat: 비밀번호 해시와 세션 토큰 유틸 추가"
```

---

### Task 3: 로그인 화면과 세션 검사

**Files:**
- Create: `app/api/login/route.ts`
- Create: `app/api/logout/route.ts`
- Create: `app/login/page.tsx`
- Create: `app/login/login-form.tsx`
- Create: `proxy.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE_NAME`, `SESSION_MAX_AGE_SECONDS`, `createSessionToken`, `isSessionTokenValid` (Task 2), `verifyPassword` (Task 2)
- Produces:
  - `POST /api/login` — 본문 `{ password: string }`, 성공 시 204 와 세션 쿠키, 실패 시 401
  - `POST /api/logout` — 204 와 만료된 쿠키
  - `proxy.ts` 가 `/login` 과 `/api/login` 을 뺀 모든 경로를 막는다

- [ ] **Step 1: 로그인 라우트**

`app/api/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session";

export async function POST(request: Request) {
  const hash = process.env.APP_PASSWORD_HASH;
  const secret = process.env.SESSION_SECRET;
  if (!hash || !secret) {
    return NextResponse.json(
      { message: "서버에 비밀번호가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    // 본문이 JSON 이 아니면 빈 비밀번호와 같게 다룬다.
  }

  if (!(await verifyPassword(password, hash))) {
    return NextResponse.json(
      { message: "비밀번호가 맞지 않습니다." },
      { status: 401 },
    );
  }

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await createSessionToken(secret, expiresAt),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
```

- [ ] **Step 2: 로그아웃 라우트**

`app/api/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
```

- [ ] **Step 3: 세션 검사 프록시**

Next 16 은 `middleware` 파일 규약을 폐기했다. `proxy.ts` 에 `proxy` 함수를 둔다.
`middleware.ts` 로 만들면 시작할 때마다 폐기 경고가 뜬다.

`proxy.ts` (저장소 루트):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { isSessionTokenValid, SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * 세션 검사. Next 16 부터 `middleware` 대신 `proxy` 규약을 쓴다.
 *
 * 비밀번호 해시가 아니라 서명만 검사하므로 Web Crypto 만 쓰는 `lib/session.ts` 를
 * 부른다. DB 는 건드리지 않는다.
 */

/** 세션 없이도 열려야 하는 경로. */
const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // 외부 서비스 연동을 붙일 자리. 지금은 토큰을 발급하지 않으므로 항상 건너뛴다.
  // 연동을 붙일 때 여기서 Authorization 헤더를 검사한다.

  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const ok =
    Boolean(secret) && (await isSessionTokenValid(token, secret!, Date.now()));
  if (ok) return NextResponse.next();

  // API 요청에 로그인 화면 HTML 을 돌려주면 fetch 쪽이 헷갈린다. 401 로 끊는다.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // 정적 파일과 이미지 최적화 경로는 검사하지 않는다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: 로그인 폼 컴포넌트**

`app/login/login-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(body.message ?? "로그인하지 못했습니다.");
        return;
      }
      router.replace("/today");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex w-full max-w-[320px] flex-col gap-3" onSubmit={submit}>
      <label
        className="text-[12px] font-semibold text-[var(--bi-fg)]"
        htmlFor="password"
      >
        비밀번호
      </label>
      <input
        autoComplete="current-password"
        autoFocus
        className="h-9 rounded border border-[var(--bi-border-strong)] bg-[var(--bi-bg)] px-3 text-[13px] text-[var(--bi-fg)] outline-none focus:border-[var(--bi-accent)]"
        id="password"
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        value={password}
      />
      <button
        className="h-9 rounded bg-[var(--bi-accent)] text-[13px] font-semibold text-white disabled:opacity-50"
        disabled={pending || !password}
        type="submit"
      >
        {pending ? "확인 중…" : "들어가기"}
      </button>
      <p aria-live="polite" className="min-h-[16px] text-[11px] text-[var(--bi-error)]">
        {error}
      </p>
    </form>
  );
}
```

- [ ] **Step 5: 로그인 페이지**

`app/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "로그인 — 프로젝트 매니지먼트",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--bi-bg)] px-6">
      <h1 className="text-[15px] font-semibold text-[var(--bi-fg)]">
        프로젝트 매니지먼트
      </h1>
      <LoginForm />
    </div>
  );
}
```

`app/login/layout.tsx` 는 만들지 않는다. `app/layout.tsx` 는 `html` 과 `body` 만
감싸고 사이드바를 넣지 않는다. 사이드바(`AppShell`)는 `app/today/layout.tsx` 처럼
구역별 레이아웃에만 있으므로 로그인 화면은 자연히 사이드바 없이 나온다.

- [ ] **Step 6: 검증용 두 번째 dev 서버를 띄울 수 있게 한다**

Next 는 `.next/dev` 에 잠금을 건다. 그래서 이미 dev 서버가 떠 있으면 두 번째를
띄울 수 없고, `proxy.ts` 같은 새 루트 파일과 새 환경변수는 재시작해야 반영된다.
남의 서버를 끄지 않고 확인하려면 빌드 디렉터리를 나눠야 한다.

`next.config.ts` 의 `nextConfig` 에 더한다.

```ts
  // 같은 저장소에서 dev 서버를 두 개 띄우려면 빌드 디렉터리를 나눠야 한다.
  // Next 가 .next/dev 를 잠그기 때문이다. 평소에는 기본값을 쓴다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
```

`.gitignore` 에 더한다.

```
# 검증용 두 번째 dev 서버의 빌드 산출물
.next-*/
```

- [ ] **Step 7: 수동 확인**

`.env` 에 `APP_PASSWORD_HASH` 와 `SESSION_SECRET` 을 채운다.

```bash
node scripts/hash-password.mjs   # APP_PASSWORD_HASH
openssl rand -hex 32             # SESSION_SECRET
```

서버를 띄운다. 30001 이 이미 쓰이고 있으면 아래처럼 다른 포트와 디렉터리를 쓴다.

```bash
NEXT_DIST_DIR=.next-verify pnpm exec next dev -p 30099
```

```bash
B=http://localhost:30099
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $B/today
curl -s -X POST $B/api/login -H 'Content-Type: application/json' -d '{"password":"틀린값"}'
curl -s -c /tmp/jar.txt -X POST $B/api/login -H 'Content-Type: application/json' -d '{"password":"<진짜값>"}'
curl -s -b /tmp/jar.txt -o /dev/null -w "%{http_code}\n" $B/today
```

Expected: 차례로 `307` 과 `/login`, "비밀번호가 맞지 않습니다.", 아무 출력 없음(204),
`200`.

확인이 끝나면 띄운 서버를 끈다. Next 가 `tsconfig.json` 의 `include` 에
`.next-verify` 경로를 넣어 두므로 `git checkout tsconfig.json` 으로 되돌린다.

- [ ] **Step 8: 타입 검사**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 9: 커밋**

```bash
git add app/login app/api/login app/api/logout proxy.ts next.config.ts .gitignore
git commit -m "feat: 비밀번호 한 겹 로그인과 세션 검사 추가"
```

---

### Task 4: 롤오버와 완료 이력 순수 함수

> **lib 안에서 값을 가져올 때는 상대 경로에 `.ts` 확장자를 붙인다.**
> `@/` 별칭은 tsconfig 만 아는 것이라 `node --test` 가 `.ts` 를 직접 읽을 때
> 해석하지 못한다. 확장자를 붙이려면 `tsconfig.json` 에
> `"allowImportingTsExtensions": true` 가 있어야 한다 (`noEmit` 이 켜져 있어야
> 쓸 수 있고, 이 저장소는 켜져 있다). 타입만 가져올 때는 `import type` 이
> 컴파일에서 지워지므로 `@/` 를 써도 된다.

**Files:**
- Create: `lib/rollover.ts`
- Create: `lib/rollover.test.mjs`
- Create: `lib/completions.ts`
- Create: `lib/completions.test.mjs`
- Modify: `lib/today-board.ts`
- Modify: `lib/today-board.test.mjs`
- Modify: `tsconfig.json` (`allowImportingTsExtensions`)

**Interfaces:**
- Consumes: `groupIssuesByProject`, `type Issue`, `type IssueGroup` (기존 `lib/today-board.ts`)
- Produces:
  - `type TodayRow = { id: string; todayDate: string; done: boolean }`
  - `type RolloverPlan = { returnToPool: string[]; remove: string[] }`
  - `planRollover(rows: TodayRow[], today: string): RolloverPlan`
  - `type Completion = { id: string; projectSlug: string; title: string; completedOn: string; completedAt: string }`
  - `type CompletionDay = { date: string; groups: IssueGroup[] }`
  - `groupCompletionsByDate(completions, registryProjects, customProjects, projectOrder): CompletionDay[]`
  - `lib/today-board.ts` 의 `TodayBoard` 에서 `date` 필드가 사라지고 `rollOverBoard` 가 없어진다

- [ ] **Step 1: 롤오버 테스트를 먼저 쓴다**

`lib/rollover.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

const { planRollover } = await import("./rollover.ts");

const row = (id, todayDate, done = false) => ({ id, todayDate, done });

test("오늘 올린 항목은 건드리지 않는다", () => {
  const plan = planRollover(
    [row("a", "2026-09-09"), row("b", "2026-09-09", true)],
    "2026-09-09",
  );
  assert.deepEqual(plan, { returnToPool: [], remove: [] });
});

test("지난 날짜의 미완료 항목은 풀로 되돌린다", () => {
  const plan = planRollover([row("a", "2026-09-08")], "2026-09-09");
  assert.deepEqual(plan, { returnToPool: ["a"], remove: [] });
});

test("지난 날짜의 완료 항목은 지운다", () => {
  const plan = planRollover([row("a", "2026-09-08", true)], "2026-09-09");
  assert.deepEqual(plan, { returnToPool: [], remove: ["a"] });
});

test("며칠 건너뛴 여러 날짜를 한 번에 정리한다", () => {
  const plan = planRollover(
    [
      row("a", "2026-09-01", true),
      row("b", "2026-09-05"),
      row("c", "2026-09-09"),
      row("d", "2026-09-08", true),
    ],
    "2026-09-09",
  );
  assert.deepEqual(plan, { returnToPool: ["b"], remove: ["a", "d"] });
});

test("미래 날짜는 정리하지 않는다", () => {
  const plan = planRollover([row("a", "2026-09-10", true)], "2026-09-09");
  assert.deepEqual(plan, { returnToPool: [], remove: [] });
});

test("빈 목록은 빈 계획을 준다", () => {
  assert.deepEqual(planRollover([], "2026-09-09"), {
    returnToPool: [],
    remove: [],
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test lib/rollover.test.mjs`
Expected: FAIL — `./rollover.ts` 를 찾을 수 없다

- [ ] **Step 3: 롤오버 구현**

`lib/rollover.ts`:

```ts
/* -------------------------------------------------------------------------
 * 날짜가 바뀐 오늘 목록을 어떻게 정리할지 계산한다.
 *
 * 보드 전체에 날짜 하나를 두지 않고 항목마다 붙은 날짜를 본다. 며칠 만에 열어도
 * 항목별 판정이 정확하다.
 *
 * 완료 이력은 여기서 만들지 않는다. 체크하는 순간 이미 쌓였으므로 지난 날짜의
 * 완료 항목은 그냥 지운다.
 * ---------------------------------------------------------------------- */

export type TodayRow = {
  id: string;
  /** 로컬 기준 YYYY-MM-DD. */
  todayDate: string;
  done: boolean;
};

export type RolloverPlan = {
  /** 이슈 풀로 되돌릴 id. */
  returnToPool: string[];
  /** 지울 id. */
  remove: string[];
};

export function planRollover(rows: TodayRow[], today: string): RolloverPlan {
  const returnToPool: string[] = [];
  const remove: string[] = [];

  for (const row of rows) {
    if (row.todayDate >= today) continue;
    if (row.done) remove.push(row.id);
    else returnToPool.push(row.id);
  }

  return { returnToPool, remove };
}
```

- [ ] **Step 4: 롤오버 테스트 통과 확인**

Run: `node --test lib/rollover.test.mjs`
Expected: PASS

- [ ] **Step 5: 완료 이력 묶기 테스트를 먼저 쓴다**

`lib/completions.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

const { groupCompletionsByDate } = await import("./completions.ts");

const REGISTRY = [{ slug: "tns", title: "TNS" }];

const done = (id, projectSlug, title, completedOn) => ({
  id,
  projectSlug,
  title,
  completedOn,
  completedAt: `${completedOn}T09:00:00.000Z`,
});

test("날짜 내림차순으로 묶는다", () => {
  const days = groupCompletionsByDate(
    [
      done("1", "tns", "가", "2026-09-07"),
      done("2", "tns", "나", "2026-09-09"),
      done("3", "tns", "다", "2026-09-08"),
    ],
    REGISTRY,
    [],
    [],
  );
  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-09-09", "2026-09-08", "2026-09-07"],
  );
});

test("한 날짜 안에서 프로젝트별로 묶는다", () => {
  const days = groupCompletionsByDate(
    [
      done("1", "tns", "가", "2026-09-09"),
      done("2", "custom-1", "나", "2026-09-09"),
    ],
    REGISTRY,
    [{ slug: "custom-1", title: "직접 추가", createdAt: "2026-09-01T00:00:00.000Z" }],
    [],
  );
  assert.equal(days.length, 1);
  assert.deepEqual(
    days[0].groups.map((group) => [group.title, group.issues.length]),
    [["TNS", 1], ["직접 추가", 1]],
  );
});

test("항목이 없는 프로젝트 그룹은 넣지 않는다", () => {
  const days = groupCompletionsByDate(
    [done("1", "tns", "가", "2026-09-09")],
    [...REGISTRY, { slug: "common", title: "공통" }],
    [],
    [],
  );
  assert.deepEqual(
    days[0].groups.map((group) => group.title),
    ["TNS"],
  );
});

test("사라진 프로젝트의 항목은 미분류로 묶인다", () => {
  const days = groupCompletionsByDate(
    [done("1", "지워진프로젝트", "가", "2026-09-09")],
    REGISTRY,
    [],
    [],
  );
  assert.deepEqual(
    days[0].groups.map((group) => group.title),
    ["미분류"],
  );
});

test("완료가 없으면 빈 배열", () => {
  assert.deepEqual(groupCompletionsByDate([], REGISTRY, [], []), []);
});
```

- [ ] **Step 6: 테스트가 실패하는지 확인**

Run: `node --test lib/completions.test.mjs`
Expected: FAIL — `./completions.ts` 를 찾을 수 없다

- [ ] **Step 7: 완료 이력 모듈 구현**

`lib/completions.ts`:

```ts
/* -------------------------------------------------------------------------
 * 완료 이력 타입과 날짜별 묶기.
 *
 * 프로젝트별로 묶는 순서와 미분류 처리는 오늘의 할 일 화면과 같아야 하므로
 * `groupIssuesByProject` 를 그대로 쓴다.
 * ---------------------------------------------------------------------- */

// lib 안에서는 상대 경로로 가져온다. `@/` 별칭은 tsconfig 만 아는 것이라
// `node --test` 가 .ts 를 직접 읽을 때 값 import 를 해석하지 못한다.
import {
  groupIssuesByProject,
  type CustomProject,
  type Issue,
  type IssueGroup,
} from "./today-board.ts";

export type Completion = {
  id: string;
  projectSlug: string;
  title: string;
  /** 완료한 날. 로컬 기준 YYYY-MM-DD. */
  completedOn: string;
  /** ISO 문자열. */
  completedAt: string;
};

export type CompletionDay = {
  date: string;
  /** 항목이 하나도 없는 그룹은 들어있지 않다. */
  groups: IssueGroup[];
};

function toIssue(completion: Completion): Issue {
  return {
    id: completion.id,
    projectSlug: completion.projectSlug,
    title: completion.title,
    createdAt: completion.completedAt,
  };
}

/** 날짜 내림차순. 완료가 없는 날짜는 아예 나오지 않는다. */
export function groupCompletionsByDate(
  completions: Completion[],
  registryProjects: { slug: string; title: string }[],
  customProjects: CustomProject[] = [],
  projectOrder: string[] = [],
): CompletionDay[] {
  const byDate = new Map<string, Completion[]>();
  for (const completion of completions) {
    const bucket = byDate.get(completion.completedOn);
    if (bucket) bucket.push(completion);
    else byDate.set(completion.completedOn, [completion]);
  }

  return [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((date) => ({
      date,
      groups: groupIssuesByProject(
        (byDate.get(date) ?? []).map(toIssue),
        registryProjects,
        customProjects,
        projectOrder,
      ).filter((group) => group.issues.length > 0),
    }));
}
```

- [ ] **Step 8: 완료 이력 테스트 통과 확인**

Run: `node --test lib/completions.test.mjs`
Expected: PASS

- [ ] **Step 9: 보드 타입에서 날짜와 롤오버를 걷어낸다**

`lib/today-board.ts` 를 고친다.

1. `TodayBoard` 타입에서 `date: string;` 줄과 그 주석을 지운다.
2. `createBoard(date: string)` 를 `createBoard()` 로 바꾸고 반환값에서 `date` 를 뺀다.
3. `rollOverBoard` 함수 전체를 지운다. 그 자리는 `lib/rollover.ts` 가 대신한다.
4. `normalizeTodayBoard(value, today)` 에서 `today` 매개변수와 `date` 정규화를 걷어낸다. 시그니처는 `normalizeTodayBoard(value: unknown): TodayBoard` 가 된다.
5. 지역 함수 `toIssue` 는 **지우지 않는다.** `normalizeTodayBoard`·`sendToToday`·
   `returnToPool` 이 함께 쓴다.
6. `formatWorklog` 는 첫 줄을 만들 때 `formatMonthDay(board.date)` 를 쓴다.
   `date: string` 매개변수를 받아 `formatMonthDay(date)` 를 쓰도록 바꾼다.
   시그니처는 `formatWorklog(board: TodayBoard, registryProjects: { slug: string; title: string }[], date: string): string` 이다.

`TODAY_BOARD_STORAGE_KEY` 는 지우지 않는다. Task 9 의 이관 코드가 아직 읽어야 한다.

- [ ] **Step 10: 보드 테스트를 새 시그니처에 맞춘다**

`lib/today-board.test.mjs` 에서:

1. `makeBoard` 헬퍼의 `date: "2026-09-09",` 줄을 지운다.
2. `rollOverBoard` 를 쓰는 테스트를 모두 지운다. 같은 규칙은 `lib/rollover.test.mjs` 가 검증한다.
3. `normalizeTodayBoard` 호출에서 두 번째 인자를 뺀다.
4. `formatWorklog` 호출에 날짜 인자를 더한다. 예: `formatWorklog(board, REGISTRY, "2026-09-09")`.

- [ ] **Step 11: 전체 테스트와 타입 검사**

Run: `pnpm test`
Expected: PASS. 화면 컴포넌트는 아직 옛 시그니처를 쓰므로 `pnpm typecheck` 는 이 시점에 실패할 수 있다. Task 6 에서 함께 맞춘다.

- [ ] **Step 12: 커밋**

```bash
git add lib/rollover.ts lib/rollover.test.mjs lib/completions.ts lib/completions.test.mjs lib/today-board.ts lib/today-board.test.mjs
git commit -m "feat: 항목별 롤오버 판정과 완료 이력 묶기 순수 함수 추가"
```

---

### Task 5: 보드 저장소 계층

**Files:**
- Create: `lib/server/board-store.ts`
- Create: `lib/server/test-db.mjs`
- Create: `lib/server/board-store.test.mjs`

**Interfaces:**
- Consumes: `prisma` (Task 1), `planRollover` (Task 4), `type TodayBoard`, `type Issue`, `type TodayItem`, `type CustomProject` (`lib/today-board.ts`)
- Produces:
  - `loadBoard(today: string): Promise<TodayBoard>` — 롤오버를 수행하고 보드를 반환
  - `createIssue(input: { id: string; projectSlug: string; title: string; now: string }): Promise<Issue>`
  - `deleteIssue(id: string): Promise<void>`
  - `moveIssue(id: string, placement: "pool" | "today", today: string): Promise<void>`
  - `setIssueDone(input: { id: string; done: boolean; completionId: string; today: string; now: string }): Promise<void>`
  - `reorderIssues(ids: string[]): Promise<void>`
  - `createCustomProject(input: { slug: string; title: string; now: string }): Promise<CustomProject>`
  - `deleteCustomProject(slug: string): Promise<void>`
  - `saveSettings(settings: { projectOrder: string[]; collapsedProjects: string[] }): Promise<void>`
  - `BOARD_SETTING_KEY: string` — `"board"`

- [ ] **Step 1: 테스트용 DB 헬퍼**

`lib/server/test-db.mjs`:

```js
/**
 * 통합 테스트용 헬퍼. TEST_DATABASE_URL 이 가리키는 별도 데이터베이스를 쓰고,
 * 각 테스트 앞에서 테이블을 비운다.
 *
 * Prisma 클라이언트는 import 시점에 DATABASE_URL 을 읽으므로 그 전에 덮어쓴다.
 */
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL 이 없습니다. .env 를 확인하세요.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { prisma } = await import("../db.ts");

export { prisma };

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "completion", "issue", "project_note", "custom_project", "app_setting" RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 2: 저장소 테스트를 먼저 쓴다**

`lib/server/board-store.test.mjs`:

```js
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma, resetDatabase } from "./test-db.mjs";

const store = await import("./board-store.ts");

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const NOW = "2026-09-09T09:00:00.000Z";

async function addIssue(id, projectSlug = "tns", title = `이슈 ${id}`) {
  return store.createIssue({ id, projectSlug, title, now: NOW });
}

test("빈 DB 는 빈 보드를 준다", async () => {
  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board, {
    issues: [],
    today: [],
    customProjects: [],
    projectOrder: [],
    collapsedProjects: [],
  });
});

test("만든 이슈는 풀에 들어간다", async () => {
  await addIssue("a");
  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.issues.length, 1);
  assert.equal(board.issues[0].title, "이슈 a");
  assert.equal(board.today.length, 0);
});

test("오늘로 옮기면 풀에서 빠진다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.issues.length, 0);
  assert.deepEqual(
    board.today.map((item) => [item.id, item.done]),
    [["a", false]],
  );
});

test("체크하면 완료 이력이 쌓인다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });

  const rows = await prisma.completion.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].completedOn, "2026-09-09");
  assert.equal(rows[0].title, "이슈 a");
});

test("체크를 풀면 그날 이력이 사라진다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });
  await store.setIssueDone({
    id: "a",
    done: false,
    completionId: "c2",
    today: "2026-09-09",
    now: NOW,
  });

  assert.equal(await prisma.completion.count(), 0);
});

test("이슈를 지워도 완료 이력은 남는다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });
  await store.deleteIssue("a");

  const rows = await prisma.completion.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "이슈 a");
  assert.equal(rows[0].issueId, null);
});

test("날짜가 바뀌면 미완료는 풀로, 완료는 사라진다", async () => {
  await addIssue("a");
  await addIssue("b");
  await store.moveIssue("a", "today", "2026-09-08");
  await store.moveIssue("b", "today", "2026-09-08");
  await store.setIssueDone({
    id: "b",
    done: true,
    completionId: "c1",
    today: "2026-09-08",
    now: NOW,
  });

  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues.map((issue) => issue.id), ["a"]);
  assert.equal(board.today.length, 0);
  // 이력은 남는다.
  assert.equal(await prisma.completion.count(), 1);
});

test("완료한 항목을 풀로 되돌리면 그날 이력도 사라진다", async () => {
  await addIssue("a");
  await store.moveIssue("a", "today", "2026-09-09");
  await store.setIssueDone({
    id: "a",
    done: true,
    completionId: "c1",
    today: "2026-09-09",
    now: NOW,
  });
  await store.moveIssue("a", "pool", "2026-09-09");

  assert.equal(await prisma.completion.count(), 0);
  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues.map((issue) => issue.id), ["a"]);
});

test("순서를 바꾸면 그 순서로 읽힌다", async () => {
  await addIssue("a");
  await addIssue("b");
  await addIssue("c");
  await store.reorderIssues(["c", "a", "b"]);

  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.issues.map((issue) => issue.id), ["c", "a", "b"]);
});

test("커스텀 프로젝트를 지워도 이슈는 남는다", async () => {
  await store.createCustomProject({ slug: "p1", title: "직접", now: NOW });
  await addIssue("a", "p1");
  await store.deleteCustomProject("p1");

  const board = await store.loadBoard("2026-09-09");
  assert.equal(board.customProjects.length, 0);
  assert.deepEqual(board.issues.map((issue) => issue.id), ["a"]);
});

test("설정은 저장한 대로 읽힌다", async () => {
  await store.saveSettings({
    projectOrder: ["tns", "common"],
    collapsedProjects: ["common"],
  });
  const board = await store.loadBoard("2026-09-09");
  assert.deepEqual(board.projectOrder, ["tns", "common"]);
  assert.deepEqual(board.collapsedProjects, ["common"]);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `node --test lib/server/board-store.test.mjs`
Expected: FAIL — `./board-store.ts` 를 찾을 수 없다

- [ ] **Step 4: 저장소 구현**

`lib/server/board-store.ts`:

```ts
/* -------------------------------------------------------------------------
 * 보드 관련 DB 접근. 라우트 핸들러만 이 파일을 부른다.
 *
 * id 와 시각은 전부 호출부가 넘긴다. 테스트가 결정적이어야 하기 때문이다.
 * ---------------------------------------------------------------------- */

import { prisma } from "@/lib/db";
import { planRollover } from "@/lib/rollover";
import type {
  CustomProject,
  Issue,
  TodayBoard,
  TodayItem,
} from "@/lib/today-board";

export const BOARD_SETTING_KEY = "board";

type Placement = "pool" | "today";

type IssueRow = {
  id: string;
  projectSlug: string;
  title: string;
  createdAt: Date;
  placement: string;
  todayDate: string | null;
  done: boolean;
  position: number;
};

function toIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    projectSlug: row.projectSlug,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTodayItem(row: IssueRow): TodayItem {
  return { ...toIssue(row), done: row.done };
}

async function readSettings(): Promise<{
  projectOrder: string[];
  collapsedProjects: string[];
}> {
  const row = await prisma.appSetting.findUnique({
    where: { key: BOARD_SETTING_KEY },
  });
  const value = (row?.value ?? {}) as {
    projectOrder?: unknown;
    collapsedProjects?: unknown;
  };
  const asStrings = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((entry) => typeof entry === "string") : [];
  return {
    projectOrder: asStrings(value.projectOrder),
    collapsedProjects: asStrings(value.collapsedProjects),
  };
}

/** 지난 날짜의 오늘 항목을 정리한다. 정리할 게 없으면 아무 쿼리도 더 돌지 않는다. */
async function runRollover(today: string): Promise<void> {
  const rows = await prisma.issue.findMany({
    where: { placement: "today" },
    select: { id: true, todayDate: true, done: true },
  });

  const plan = planRollover(
    rows.map((row) => ({
      id: row.id,
      todayDate: row.todayDate ?? today,
      done: row.done,
    })),
    today,
  );

  if (!plan.returnToPool.length && !plan.remove.length) return;

  await prisma.$transaction([
    prisma.issue.updateMany({
      where: { id: { in: plan.returnToPool } },
      data: { placement: "pool", todayDate: null, done: false },
    }),
    prisma.issue.deleteMany({ where: { id: { in: plan.remove } } }),
  ]);
}

export async function loadBoard(today: string): Promise<TodayBoard> {
  await runRollover(today);

  const [rows, projects, settings] = await Promise.all([
    prisma.issue.findMany({ orderBy: { position: "asc" } }),
    prisma.customProject.findMany({ orderBy: { createdAt: "asc" } }),
    readSettings(),
  ]);

  return {
    issues: rows.filter((row) => row.placement === "pool").map(toIssue),
    today: rows.filter((row) => row.placement === "today").map(toTodayItem),
    customProjects: projects.map(
      (project): CustomProject => ({
        slug: project.slug,
        title: project.title,
        createdAt: project.createdAt.toISOString(),
      }),
    ),
    projectOrder: settings.projectOrder,
    collapsedProjects: settings.collapsedProjects,
  };
}

/** 목록 맨 뒤 자리를 준다. 목록이 비어 있으면 0. */
async function nextPosition(placement: Placement): Promise<number> {
  const last = await prisma.issue.findFirst({
    where: { placement },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return last ? last.position + 1 : 0;
}

export async function createIssue(input: {
  id: string;
  projectSlug: string;
  title: string;
  now: string;
}): Promise<Issue> {
  const row = await prisma.issue.create({
    data: {
      id: input.id,
      projectSlug: input.projectSlug,
      title: input.title,
      createdAt: new Date(input.now),
      placement: "pool",
      todayDate: null,
      done: false,
      position: await nextPosition("pool"),
    },
  });
  return toIssue(row);
}

export async function deleteIssue(id: string): Promise<void> {
  await prisma.issue.delete({ where: { id } });
}

export async function moveIssue(
  id: string,
  placement: Placement,
  today: string,
): Promise<void> {
  const position = await nextPosition(placement);

  if (placement === "today") {
    await prisma.issue.update({
      where: { id },
      data: { placement, todayDate: today, position },
    });
    return;
  }

  // 풀로 되돌아가면 완료 표시가 의미를 잃는다. 체크를 푼 것과 같게 다뤄
  // 그날 쌓인 이력도 함께 지운다. 그러지 않으면 다시 체크할 때 같은 날짜에
  // 이력이 두 번 남는다.
  await prisma.$transaction([
    prisma.completion.deleteMany({ where: { issueId: id, completedOn: today } }),
    prisma.issue.update({
      where: { id },
      data: { placement, todayDate: null, done: false, position },
    }),
  ]);
}

/**
 * 체크 상태를 바꾸고 완료 이력을 같은 트랜잭션에서 만들거나 지운다.
 * 체크를 풀 때는 그 이슈의 그날 이력만 지운다.
 */
export async function setIssueDone(input: {
  id: string;
  done: boolean;
  completionId: string;
  today: string;
  now: string;
}): Promise<void> {
  const issue = await prisma.issue.findUnique({ where: { id: input.id } });
  if (!issue) return;

  await prisma.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: input.id },
      data: { done: input.done },
    });

    if (input.done) {
      await tx.completion.create({
        data: {
          id: input.completionId,
          issueId: issue.id,
          projectSlug: issue.projectSlug,
          title: issue.title,
          completedOn: input.today,
          completedAt: new Date(input.now),
        },
      });
    } else {
      await tx.completion.deleteMany({
        where: { issueId: issue.id, completedOn: input.today },
      });
    }
  });
}

/** 넘어온 순서대로 0부터 다시 매긴다. 목록에 없는 id 는 무시된다. */
export async function reorderIssues(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.issue.updateMany({ where: { id }, data: { position: index } }),
    ),
  );
}

export async function createCustomProject(input: {
  slug: string;
  title: string;
  now: string;
}): Promise<CustomProject> {
  const row = await prisma.customProject.create({
    data: {
      slug: input.slug,
      title: input.title,
      createdAt: new Date(input.now),
    },
  });
  return {
    slug: row.slug,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 프로젝트만 지운다. 그 프로젝트의 이슈는 손대지 않는다. 화면이 미분류로 묶는다. */
export async function deleteCustomProject(slug: string): Promise<void> {
  await prisma.customProject.delete({ where: { slug } });
}

export async function saveSettings(settings: {
  projectOrder: string[];
  collapsedProjects: string[];
}): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: BOARD_SETTING_KEY },
    create: { key: BOARD_SETTING_KEY, value: settings },
    update: { value: settings },
  });
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test lib/server/board-store.test.mjs`
Expected: PASS (열한 개 테스트)

- [ ] **Step 6: 테스트 스크립트가 새 폴더를 잡는지 확인**

Run: `pnpm test`
Expected: `lib/server/` 아래 테스트까지 함께 돌고 통과한다. 따옴표로 감싼
`"lib/**/*.test.mjs"` 글롭이 하위 폴더를 잡는 것은 확인되어 있다.

- [ ] **Step 7: 커밋**

```bash
git add lib/server/board-store.ts lib/server/board-store.test.mjs lib/server/test-db.mjs package.json
git commit -m "feat: 보드 저장소 계층과 통합 테스트 추가"
```

---

### Task 6: 보드 API 라우트

**Files:**
- Create: `lib/api-types.ts`
- Create: `app/api/board/route.ts`
- Create: `app/api/issues/route.ts`
- Create: `app/api/issues/[id]/route.ts`
- Create: `app/api/issues/order/route.ts`
- Create: `app/api/projects/route.ts`
- Create: `app/api/projects/[slug]/route.ts`
- Create: `app/api/settings/route.ts`

**Interfaces:**
- Consumes: `lib/server/board-store.ts` 전체 (Task 5), `todayDateString` (`lib/today-board.ts`)
- Produces:
  - `GET /api/board` → `TodayBoard`
  - `POST /api/issues` 본문 `{ projectSlug, title }` → `Issue`
  - `PATCH /api/issues/[id]` 본문 `{ placement?: "pool" | "today"; done?: boolean }` → 204
  - `DELETE /api/issues/[id]` → 204
  - `PUT /api/issues/order` 본문 `{ ids: string[] }` → 204
  - `POST /api/projects` 본문 `{ title }` → `CustomProject`
  - `DELETE /api/projects/[slug]` → 204
  - `PUT /api/settings` 본문 `{ projectOrder, collapsedProjects }` → 204
  - `lib/api-types.ts` 가 `createId(prefix: string): string` 과 `jsonError(message, status)` 를 내보낸다

- [ ] **Step 1: 공용 헬퍼**

`lib/api-types.ts`:

```ts
import { NextResponse } from "next/server";

/** 이슈·프로젝트·완료 이력 id 를 만든다. 서버에서 만들어 클라이언트와 어긋나지 않게 한다. */
export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

/** 본문이 JSON 이 아니면 빈 객체로 다룬다. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // 아래에서 빈 객체를 돌려준다.
  }
  return {};
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
```

- [ ] **Step 2: 보드 조회 라우트**

`app/api/board/route.ts`:

```ts
import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/server/board-store";
import { todayDateString } from "@/lib/today-board";

/** 롤오버가 매 요청 판정되어야 하므로 캐시하지 않는다. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadBoard(todayDateString(new Date())));
}
```

- [ ] **Step 3: 이슈 생성 라우트**

`app/api/issues/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import { createIssue } from "@/lib/server/board-store";

export async function POST(request: Request) {
  const body = await readJson(request);
  const projectSlug =
    typeof body.projectSlug === "string" ? body.projectSlug : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!projectSlug) return jsonError("프로젝트를 지정해야 합니다.", 400);
  if (!title) return jsonError("제목이 비어 있습니다.", 400);

  const issue = await createIssue({
    id: createId("issue"),
    projectSlug,
    title,
    now: new Date().toISOString(),
  });
  return NextResponse.json(issue, { status: 201 });
}
```

- [ ] **Step 4: 이슈 수정·삭제 라우트**

`app/api/issues/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import { deleteIssue, moveIssue, setIssueDone } from "@/lib/server/board-store";
import { todayDateString } from "@/lib/today-board";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await readJson(request);
  const today = todayDateString(new Date());

  if (body.placement === "pool" || body.placement === "today") {
    await moveIssue(id, body.placement, today);
  }

  if (typeof body.done === "boolean") {
    await setIssueDone({
      id,
      done: body.done,
      completionId: createId("done"),
      today,
      now: new Date().toISOString(),
    });
  }

  if (body.placement === undefined && body.done === undefined) {
    return jsonError("바꿀 내용이 없습니다.", 400);
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  await deleteIssue(id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: 이슈 순서 라우트**

`app/api/issues/order/route.ts`:

```ts
import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { reorderIssues } from "@/lib/server/board-store";

export async function PUT(request: Request) {
  const body = await readJson(request);
  await reorderIssues(asStringArray(body.ids));
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 6: 프로젝트 라우트**

`app/api/projects/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createId, jsonError, readJson } from "@/lib/api-types";
import { createCustomProject } from "@/lib/server/board-store";

export async function POST(request: Request) {
  const body = await readJson(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return jsonError("이름이 비어 있습니다.", 400);

  const project = await createCustomProject({
    slug: createId("custom"),
    title,
    now: new Date().toISOString(),
  });
  return NextResponse.json(project, { status: 201 });
}
```

`app/api/projects/[slug]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { deleteCustomProject } from "@/lib/server/board-store";

type Context = { params: Promise<{ slug: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { slug } = await context.params;
  await deleteCustomProject(slug);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 7: 설정 라우트**

`app/api/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { saveSettings } from "@/lib/server/board-store";

export async function PUT(request: Request) {
  const body = await readJson(request);
  await saveSettings({
    projectOrder: asStringArray(body.projectOrder),
    collapsedProjects: asStringArray(body.collapsedProjects),
  });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 8: 수동 확인**

```bash
pnpm dev
```

브라우저에서 로그인한 뒤 개발자도구 콘솔에서 확인한다.

```js
await (await fetch("/api/board")).json();
await fetch("/api/issues", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectSlug: "tns", title: "테스트" }),
}).then((r) => r.json());
await (await fetch("/api/board")).json();
```

Expected: 두 번째 조회에 방금 만든 이슈가 보인다.

로그아웃 상태에서 `/api/board` 를 부르면 401 이 온다.

- [ ] **Step 9: 타입 검사**

Run: `pnpm typecheck`
Expected: 화면 컴포넌트가 아직 옛 시그니처를 쓰므로 `components/today-board/today-board.tsx` 관련 오류만 남는다. 다른 오류는 여기서 고친다.

- [ ] **Step 10: 커밋**

```bash
git add lib/api-types.ts app/api/board app/api/issues app/api/projects app/api/settings
git commit -m "feat: 보드 REST 라우트 추가"
```

---

### Task 7: 오늘의 할 일 화면을 API 에 연결

**Files:**
- Create: `lib/api-client.ts`
- Modify: `components/today-board/today-board.tsx`
- Modify: `components/today-board/today-list.tsx`
- Modify: `app/today/page.tsx`

**Interfaces:**
- Consumes: Task 6 의 모든 엔드포인트, `planRollover` 는 서버에만 있으므로 화면은 쓰지 않는다
- Produces:
  - `lib/api-client.ts` 가 내보내는 함수들:
    - `fetchBoard(): Promise<TodayBoard>`
    - `postIssue(projectSlug: string, title: string): Promise<Issue>`
    - `patchIssue(id: string, patch: { placement?: "pool" | "today"; done?: boolean }): Promise<void>`
    - `deleteIssueRequest(id: string): Promise<void>`
    - `putIssueOrder(ids: string[]): Promise<void>`
    - `postProject(title: string): Promise<CustomProject>`
    - `deleteProjectRequest(slug: string): Promise<void>`
    - `putSettings(settings: { projectOrder: string[]; collapsedProjects: string[] }): Promise<void>`

- [ ] **Step 1: fetch 래퍼**

`lib/api-client.ts`:

```ts
/* -------------------------------------------------------------------------
 * 화면이 쓰는 fetch 래퍼. 응답이 성공이 아니면 던진다.
 * 화면은 순수 함수로 상태를 먼저 바꾸고 여기 함수를 부른다. 던지면 보드를 다시
 * 받아 덮어쓴다.
 * ---------------------------------------------------------------------- */

import type { CustomProject, Issue, TodayBoard } from "@/lib/today-board";

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init?.headers }
      : init?.headers,
  });
  if (!response.ok) {
    // 세션이 끊기면 proxy 가 401 을 준다. 로그인 화면으로 보낸다.
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error(`요청 실패: ${response.status}`);
  }
  return response;
}

export async function fetchBoard(): Promise<TodayBoard> {
  return (await request("/api/board")).json();
}

export async function postIssue(
  projectSlug: string,
  title: string,
): Promise<Issue> {
  const response = await request("/api/issues", {
    method: "POST",
    body: JSON.stringify({ projectSlug, title }),
  });
  return response.json();
}

export async function patchIssue(
  id: string,
  patch: { placement?: "pool" | "today"; done?: boolean },
): Promise<void> {
  await request(`/api/issues/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteIssueRequest(id: string): Promise<void> {
  await request(`/api/issues/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function putIssueOrder(ids: string[]): Promise<void> {
  await request("/api/issues/order", {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}

export async function postProject(title: string): Promise<CustomProject> {
  const response = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return response.json();
}

export async function deleteProjectRequest(slug: string): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}

export async function putSettings(settings: {
  projectOrder: string[];
  collapsedProjects: string[];
}): Promise<void> {
  await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
```

- [ ] **Step 2: 컨테이너의 저장 방식을 바꾼다**

`components/today-board/today-board.tsx` 를 고친다.

1. `TODAY_BOARD_STORAGE_KEY`, `createBoard`, `normalizeTodayBoard`, `rollOverBoard`, `todayDateString` import 를 정리한다. `todayDateString` 은 남긴다.
2. `createId` 지역 함수를 지운다. id 는 서버가 만든다.
3. 저장값을 읽던 `useEffect` 두 개를 다음으로 바꾼다.

```tsx
const [board, setBoard] = useState<TodayBoard | null>(null);
const [storageError, setStorageError] = useState<string | null>(null);
const [announcement, setAnnouncement] = useState("");
const today = todayDateString(new Date());

const reload = useCallback(async () => {
  try {
    setBoard(await fetchBoard());
    setStorageError(null);
  } catch {
    setStorageError("서버에서 내용을 불러오지 못했습니다.");
  }
}, []);

useEffect(() => {
  void reload();
}, [reload]);

/**
 * 화면 상태를 먼저 바꾸고 서버에 반영한다. 실패하면 서버 상태를 다시 받아
 * 덮어써서 화면과 서버가 어긋난 채로 남지 않게 한다.
 */
const sync = useCallback(
  async (call: () => Promise<unknown>) => {
    try {
      await call();
      setStorageError(null);
    } catch {
      setStorageError("서버에 저장하지 못했습니다. 최신 내용을 다시 불러옵니다.");
      await reload();
    }
  },
  [reload],
);
```

4. 각 핸들러를 낙관적 갱신 + 동기화로 바꾼다. 서버가 id 를 만드는 두 곳은 순서가 다르다.

```tsx
// 서버가 id 를 만들므로 응답을 받은 뒤 상태에 넣는다.
const handleAdd = (projectSlug: string, title: string) => {
  void sync(async () => {
    const issue = await postIssue(projectSlug, title);
    setBoard((current) =>
      current ? { ...current, issues: [...current.issues, issue] } : current,
    );
  });
};

const handleAddProject = (title: string) => {
  void sync(async () => {
    const project = await postProject(title);
    setBoard((current) =>
      current
        ? { ...current, customProjects: [...current.customProjects, project] }
        : current,
    );
    setAnnouncement(`${title.trim()} 프로젝트를 추가했습니다.`);
  });
};

const handleRemove = (issue: Issue) => {
  if (!window.confirm(`“${issue.title}” 이슈를 삭제할까요?`)) return;
  setBoard((current) => (current ? removeIssue(current, issue.id) : current));
  setAnnouncement(`${issue.title} 이슈를 삭제했습니다.`);
  void sync(() => deleteIssueRequest(issue.id));
};

const handleSendToToday = (issue: Issue) => {
  setBoard((current) => (current ? sendToToday(current, issue.id) : current));
  setAnnouncement(`${issue.title} 이슈를 오늘의 할 일로 옮겼습니다.`);
  void sync(() => patchIssue(issue.id, { placement: "today" }));
};

const handleReturn = (item: TodayItem) => {
  setBoard((current) => (current ? returnToPool(current, item.id) : current));
  setAnnouncement(`${item.title} 항목을 이슈 목록으로 되돌렸습니다.`);
  void sync(() => patchIssue(item.id, { placement: "pool" }));
};

const handleToggle = (item: TodayItem) => {
  setBoard((current) => (current ? toggleDone(current, item.id) : current));
  setAnnouncement(
    item.done
      ? `${item.title} 항목의 완료를 취소했습니다.`
      : `${item.title} 항목을 완료했습니다.`,
  );
  void sync(() => patchIssue(item.id, { done: !item.done }));
};

const handleRemoveProject = (group: IssueGroup) => {
  if (!group.slug) return;
  const moved = group.issues.length
    ? ` 이슈 ${group.issues.length}건은 미분류로 옮겨집니다.`
    : "";
  if (!window.confirm(`“${group.title}” 프로젝트를 삭제할까요?${moved}`)) return;
  const slug = group.slug;
  setBoard((current) => (current ? removeProject(current, slug) : current));
  setAnnouncement(`${group.title} 프로젝트를 삭제했습니다.${moved}`);
  void sync(() => deleteProjectRequest(slug));
};
```

5. 순서와 접힘은 설정 엔드포인트로 보낸다. `setBoard` 업데이터 안에서 요청을
보내면 안 된다. 업데이터는 순수해야 하고 React 가 두 번 부를 수 있기 때문이다.
`board` 와 이미 계산된 `orderedSlugs` 를 써서 업데이터 밖에서 다음 상태를 만든다.

```tsx
const handleMoveProject = (
  slug: string,
  targetSlug: string,
  position: "before" | "after",
) => {
  if (!board) return;
  const next = moveProject(board, orderedSlugs, slug, targetSlug, position);
  setBoard(next);
  void sync(() =>
    putSettings({
      projectOrder: next.projectOrder,
      collapsedProjects: next.collapsedProjects,
    }),
  );
};

const handleToggleCollapsed = (slug: string) => {
  if (!board) return;
  const next = toggleProjectCollapsed(board, slug);
  setBoard(next);
  void sync(() =>
    putSettings({
      projectOrder: next.projectOrder,
      collapsedProjects: next.collapsedProjects,
    }),
  );
};
```

6. `TodayList` 에 넘기던 `date={board.date}` 를 `date={today}` 로 바꾼다.
7. `formatWorklog(board, projects)` 를 `formatWorklog(board, projects, today)` 로 바꾼다.
8. 로딩 문구를 "서버에서 내용을 불러오는 중입니다." 로 바꾼다.

- [ ] **Step 3: 페이지 안내 문구와 이력 링크**

`app/today/page.tsx` 의 `description` 을 바꾼다.

```tsx
description="프로젝트별로 쌓인 이슈를 오늘 할 일로 옮겨 체크합니다. 내용은 서버에 저장되어 어느 브라우저에서나 같습니다."
```

- [ ] **Step 4: 타입 검사**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 5: 수동 확인**

```bash
pnpm dev
```

확인할 것:
1. 이슈를 추가하고 새로고침해도 남는다.
2. 다른 브라우저에서 열면 같은 내용이 보인다.
3. 오늘로 옮기고 체크한 뒤 새로고침해도 상태가 유지된다.
4. 프로젝트 순서를 바꾸고 새로고침해도 순서가 유지된다.
5. 개발 서버를 끄고 이슈를 추가하면 오류 문구가 뜬다.

- [ ] **Step 6: 커밋**

```bash
git add lib/api-client.ts components/today-board app/today/page.tsx
git commit -m "feat: 오늘의 할 일을 서버 저장으로 전환"
```

---

### Task 8: 명심할 점 저장소와 API

**Files:**
- Create: `lib/server/notes-store.ts`
- Create: `lib/server/notes-store.test.mjs`
- Create: `app/api/notes/[project]/route.ts`
- Create: `app/api/notes/[project]/order/route.ts`
- Create: `app/api/notes/item/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1), `type ProjectNote`, `PROJECT_NOTE_PRIORITIES` (`lib/project-notes.ts`), `createId`, `jsonError`, `readJson`, `asStringArray` (Task 6)
- Produces:
  - `listNotes(projectSlug: string): Promise<ProjectNote[]>`
  - `createNote(input: { id: string; projectSlug: string; now: string }): Promise<ProjectNote>`
  - `updateNote(id: string, patch: { content?: string; priority?: string }, now: string): Promise<void>`
  - `deleteNote(id: string): Promise<void>`
  - `reorderNotes(ids: string[]): Promise<void>`
  - `GET`/`POST /api/notes/[project]`, `PUT /api/notes/[project]/order`, `PATCH`/`DELETE /api/notes/item/[id]`

새 항목은 표 맨 위에 들어간다. 기존 `addNote` 가 배열 앞에 붙이기 때문이다. 그래서 `createNote` 는 그 프로젝트의 최소 `position` 보다 하나 작은 값을 준다.

경로를 `/api/notes/item/[id]` 로 둔 이유는 `/api/notes/[project]` 와 같은 자리에 두면 Next.js 라우팅이 갈리지 않기 때문이다.

- [ ] **Step 1: 저장소 테스트를 먼저 쓴다**

`lib/server/notes-store.test.mjs`:

```js
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma, resetDatabase } from "./test-db.mjs";

const store = await import("./notes-store.ts");

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

const NOW = "2026-09-09T09:00:00.000Z";

test("빈 프로젝트는 빈 목록", async () => {
  assert.deepEqual(await store.listNotes("tns"), []);
});

test("만든 항목이 읽힌다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  const notes = await store.listNotes("tns");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, "n1");
  assert.equal(notes[0].content, "");
  assert.equal(notes[0].priority, "normal");
});

test("새 항목은 맨 위에 붙는다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.createNote({ id: "n2", projectSlug: "tns", now: NOW });
  const notes = await store.listNotes("tns");
  assert.deepEqual(notes.map((note) => note.id), ["n2", "n1"]);
});

test("다른 프로젝트의 항목은 섞이지 않는다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.createNote({ id: "n2", projectSlug: "common", now: NOW });
  assert.deepEqual(
    (await store.listNotes("tns")).map((note) => note.id),
    ["n1"],
  );
});

test("내용과 우선순위를 고친다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.updateNote(
    "n1",
    { content: "납기 확인", priority: "urgent" },
    "2026-09-10T00:00:00.000Z",
  );
  const [note] = await store.listNotes("tns");
  assert.equal(note.content, "납기 확인");
  assert.equal(note.priority, "urgent");
  assert.equal(note.updatedAt, "2026-09-10T00:00:00.000Z");
});

test("지운 항목은 사라진다", async () => {
  await store.createNote({ id: "n1", projectSlug: "tns", now: NOW });
  await store.deleteNote("n1");
  assert.deepEqual(await store.listNotes("tns"), []);
});

test("순서를 바꾸면 그 순서로 읽힌다", async () => {
  for (const id of ["n1", "n2", "n3"]) {
    await store.createNote({ id, projectSlug: "tns", now: NOW });
  }
  await store.reorderNotes(["n1", "n3", "n2"]);
  assert.deepEqual(
    (await store.listNotes("tns")).map((note) => note.id),
    ["n1", "n3", "n2"],
  );
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test lib/server/notes-store.test.mjs`
Expected: FAIL — `./notes-store.ts` 를 찾을 수 없다

- [ ] **Step 3: 저장소 구현**

`lib/server/notes-store.ts`:

```ts
import { prisma } from "@/lib/db";
import type { ProjectNote, ProjectNotePriority } from "@/lib/project-notes";

const PRIORITIES = new Set<ProjectNotePriority>([
  "urgent",
  "high",
  "normal",
  "low",
]);

type NoteRow = {
  id: string;
  content: string;
  priority: string;
  updatedAt: Date;
};

function toNote(row: NoteRow): ProjectNote {
  return {
    id: row.id,
    content: row.content,
    priority: PRIORITIES.has(row.priority as ProjectNotePriority)
      ? (row.priority as ProjectNotePriority)
      : "normal",
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotes(projectSlug: string): Promise<ProjectNote[]> {
  const rows = await prisma.projectNote.findMany({
    where: { projectSlug },
    orderBy: { position: "asc" },
  });
  return rows.map(toNote);
}

/** 새 항목은 표 맨 위에 들어간다. 그래서 지금 최소값보다 하나 작은 자리를 준다. */
export async function createNote(input: {
  id: string;
  projectSlug: string;
  now: string;
}): Promise<ProjectNote> {
  const first = await prisma.projectNote.findFirst({
    where: { projectSlug: input.projectSlug },
    orderBy: { position: "asc" },
    select: { position: true },
  });

  const row = await prisma.projectNote.create({
    data: {
      id: input.id,
      projectSlug: input.projectSlug,
      content: "",
      priority: "normal",
      position: first ? first.position - 1 : 0,
      updatedAt: new Date(input.now),
    },
  });
  return toNote(row);
}

export async function updateNote(
  id: string,
  patch: { content?: string; priority?: string },
  now: string,
): Promise<void> {
  const priority =
    patch.priority && PRIORITIES.has(patch.priority as ProjectNotePriority)
      ? patch.priority
      : undefined;

  await prisma.projectNote.update({
    where: { id },
    data: {
      content: patch.content,
      priority,
      updatedAt: new Date(now),
    },
  });
}

export async function deleteNote(id: string): Promise<void> {
  await prisma.projectNote.delete({ where: { id } });
}

/** 넘어온 순서대로 0부터 다시 매긴다. */
export async function reorderNotes(ids: string[]): Promise<void> {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.projectNote.updateMany({ where: { id }, data: { position: index } }),
    ),
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test lib/server/notes-store.test.mjs`
Expected: PASS (일곱 개 테스트)

- [ ] **Step 5: 목록·생성 라우트**

`app/api/notes/[project]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createId } from "@/lib/api-types";
import { createNote, listNotes } from "@/lib/server/notes-store";

type Context = { params: Promise<{ project: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Context) {
  const { project } = await context.params;
  return NextResponse.json(await listNotes(project));
}

export async function POST(_request: Request, context: Context) {
  const { project } = await context.params;
  const note = await createNote({
    id: createId("note"),
    projectSlug: project,
    now: new Date().toISOString(),
  });
  return NextResponse.json(note, { status: 201 });
}
```

- [ ] **Step 6: 순서 라우트**

`app/api/notes/[project]/order/route.ts`:

```ts
import { NextResponse } from "next/server";
import { asStringArray, readJson } from "@/lib/api-types";
import { reorderNotes } from "@/lib/server/notes-store";

export async function PUT(request: Request) {
  const body = await readJson(request);
  await reorderNotes(asStringArray(body.ids));
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 7: 항목 수정·삭제 라우트**

`app/api/notes/item/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api-types";
import { deleteNote, updateNote } from "@/lib/server/notes-store";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await readJson(request);

  const content = typeof body.content === "string" ? body.content : undefined;
  const priority = typeof body.priority === "string" ? body.priority : undefined;
  if (content === undefined && priority === undefined) {
    return jsonError("바꿀 내용이 없습니다.", 400);
  }

  await updateNote(id, { content, priority }, new Date().toISOString());
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  await deleteNote(id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 8: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck`
Expected: 모두 통과

- [ ] **Step 9: 커밋**

```bash
git add lib/server/notes-store.ts lib/server/notes-store.test.mjs app/api/notes
git commit -m "feat: 명심할 점 저장소와 REST 라우트 추가"
```

---

### Task 9: 명심할 점 화면을 API 에 연결

**Files:**
- Modify: `lib/api-client.ts`
- Modify: `components/project-notes/project-notes-table.tsx`

**Interfaces:**
- Consumes: Task 8 의 엔드포인트
- Produces: `lib/api-client.ts` 에 다음이 더해진다
  - `fetchNotes(projectSlug: string): Promise<ProjectNote[]>`
  - `postNote(projectSlug: string): Promise<ProjectNote>`
  - `patchNote(id: string, patch: { content?: string; priority?: string }): Promise<void>`
  - `deleteNoteRequest(id: string): Promise<void>`
  - `putNoteOrder(projectSlug: string, ids: string[]): Promise<void>`

내용 입력은 글자마다 상태가 바뀐다. 매 타건마다 요청을 보내면 안 되므로 **500밀리초 디바운스**를 건다. 우선순위 변경과 삭제, 순서 변경은 즉시 보낸다.

- [ ] **Step 1: fetch 래퍼에 명심할 점 함수 추가**

`lib/api-client.ts` 끝에 더한다.

```ts
import type { ProjectNote } from "@/lib/project-notes";

export async function fetchNotes(projectSlug: string): Promise<ProjectNote[]> {
  const response = await request(
    `/api/notes/${encodeURIComponent(projectSlug)}`,
  );
  return response.json();
}

export async function postNote(projectSlug: string): Promise<ProjectNote> {
  const response = await request(
    `/api/notes/${encodeURIComponent(projectSlug)}`,
    { method: "POST", body: "{}" },
  );
  return response.json();
}

export async function patchNote(
  id: string,
  patch: { content?: string; priority?: string },
): Promise<void> {
  await request(`/api/notes/item/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteNoteRequest(id: string): Promise<void> {
  await request(`/api/notes/item/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function putNoteOrder(
  projectSlug: string,
  ids: string[],
): Promise<void> {
  await request(`/api/notes/${encodeURIComponent(projectSlug)}/order`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}
```

`import type { ProjectNote }` 는 파일 맨 위 import 블록으로 옮긴다.

- [ ] **Step 2: 표 컴포넌트의 저장 방식을 바꾼다**

`components/project-notes/project-notes-table.tsx` 를 고친다.

1. `projectNotesStorageKey` import 와 `storageKey` `useMemo` 를 지운다.
2. `createNoteId` 지역 함수를 지운다. id 는 서버가 만든다.
3. 저장값 읽기·쓰기 `useEffect` 두 개를 다음으로 바꾼다.

```tsx
const [notes, setNotes] = useState<ProjectNote[]>([]);
const [loaded, setLoaded] = useState(false);
const [storageError, setStorageError] = useState<string | null>(null);

const reload = useCallback(async () => {
  try {
    setNotes(await fetchNotes(projectSlug));
    setStorageError(null);
  } catch {
    setStorageError("서버에서 내용을 불러오지 못했습니다.");
  } finally {
    setLoaded(true);
  }
}, [projectSlug]);

useEffect(() => {
  setLoaded(false);
  void reload();
}, [reload]);

const sync = useCallback(
  async (call: () => Promise<unknown>) => {
    try {
      await call();
      setStorageError(null);
    } catch {
      setStorageError("서버에 저장하지 못했습니다. 최신 내용을 다시 불러옵니다.");
      await reload();
    }
  },
  [reload],
);
```

4. 내용 입력용 디바운스를 더한다.

```tsx
/** 내용 입력은 글자마다 바뀐다. 마지막 입력에서 500밀리초 뒤에 한 번만 보낸다. */
const contentTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

useEffect(() => {
  const timers = contentTimers.current;
  return () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}, []);

const queueContentSave = (id: string, content: string) => {
  const timers = contentTimers.current;
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void sync(() => patchNote(id, { content }));
    }, 500),
  );
};
```

5. 각 조작을 낙관적 갱신 + 동기화로 바꾼다.

```tsx
const addNote = () => {
  void sync(async () => {
    const note = await postNote(projectSlug);
    pendingFocusIdRef.current = note.id;
    setNotes((current) => [note, ...current]);
  });
};

const editNote = (
  id: string,
  patch: Partial<Pick<ProjectNote, "content" | "priority">>,
) => {
  setNotes((current) =>
    updateProjectNote(current, id, patch, new Date().toISOString()),
  );
  if (patch.content !== undefined) queueContentSave(id, patch.content);
  if (patch.priority !== undefined) {
    void sync(() => patchNote(id, { priority: patch.priority }));
  }
};

const removeNote = (note: ProjectNote) => {
  if (!window.confirm(`“${noteLabel(note)}” 항목을 삭제할까요?`)) return;
  inputRefs.current.delete(note.id);
  // 예약된 내용 저장이 있으면 취소한다. 지운 항목에 PATCH 를 보내면 실패한다.
  const timer = contentTimers.current.get(note.id);
  if (timer) {
    clearTimeout(timer);
    contentTimers.current.delete(note.id);
  }
  setNotes((current) => current.filter((item) => item.id !== note.id));
  void sync(() => deleteNoteRequest(note.id));
};
```

6. `moveNote` 안에서 `setNotes(next)` 뒤에 순서를 보낸다.

```tsx
void sync(() => putNoteOrder(projectSlug, next.map((item) => item.id)));
```

7. 오류 문구를 "이 브라우저에 내용을 저장할 수 없습니다." 에서 위의 서버 문구로 바꾼다. 로딩 문구가 있으면 "서버에서 내용을 불러오는 중입니다." 로 바꾼다.

- [ ] **Step 3: 페이지 안내 문구 확인**

`app/flows/[project]/notes/page.tsx` 의 `description` 은 저장 위치를 언급하지 않는다.
확인만 하고 손대지 않는다. 이 태스크에서 이 파일은 바뀌지 않는다.

- [ ] **Step 4: 타입 검사**

Run: `pnpm typecheck`
Expected: 통과

- [ ] **Step 5: 수동 확인**

```bash
pnpm dev
```

확인할 것:
1. `/flows/tns/notes` 에서 항목을 추가하면 맨 위에 생기고 입력란에 커서가 간다.
2. 내용을 빠르게 입력해도 요청이 한 번만 간다. 네트워크 탭에서 확인한다.
3. 새로고침해도 내용이 남는다.
4. 다른 브라우저에서 같은 내용이 보인다.
5. 우선순위를 바꾸고 새로고침해도 유지된다.
6. 순서를 바꾸고 새로고침해도 유지된다.
7. 입력 중 바로 삭제해도 오류가 나지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add lib/api-client.ts components/project-notes
git commit -m "feat: 명심할 점을 서버 저장으로 전환"
```

---

### Task 10: 기존 localStorage 데이터 이관

**Files:**
- Create: `lib/import-legacy.ts`
- Create: `lib/import-legacy.test.mjs`
- Create: `app/api/import/route.ts`
- Modify: `lib/server/board-store.ts`
- Modify: `components/today-board/today-board.tsx`

**Interfaces:**
- Consumes: `normalizeTodayBoard` (`lib/today-board.ts`), `normalizeProjectNotes` (`lib/project-notes.ts`), `TODAY_BOARD_STORAGE_KEY`, `projectNotesStorageKey`, `flowProjects`
- Produces:
  - `type LegacyPayload = { board: TodayBoard | null; notes: { projectSlug: string; notes: ProjectNote[] }[] }`
  - `readLegacyData(storage: Pick<Storage, "getItem">, projectSlugs: string[]): LegacyPayload`
  - `clearLegacyData(storage: Pick<Storage, "removeItem">, projectSlugs: string[]): void`
  - `hasLegacyData(payload: LegacyPayload): boolean`
  - `isBoardEmpty(): Promise<boolean>` (`lib/server/board-store.ts` 에 추가)
  - `importLegacy(payload): Promise<void>` (`lib/server/board-store.ts` 에 추가)
  - `POST /api/import` → 204, 서버가 비어 있지 않으면 409

- [ ] **Step 1: 읽기 함수 테스트를 먼저 쓴다**

`lib/import-legacy.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

const { readLegacyData, clearLegacyData, hasLegacyData } = await import(
  "./import-legacy.ts"
);

function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
  };
}

const BOARD_KEY = "project-management.today-board.v1";
const NOTES_KEY = "project-management.project-notes.v1:tns";

test("아무것도 없으면 빈 결과", () => {
  const payload = readLegacyData(fakeStorage({}), ["tns"]);
  assert.equal(payload.board, null);
  assert.deepEqual(payload.notes, []);
  assert.equal(hasLegacyData(payload), false);
});

test("보드를 읽는다", () => {
  const storage = fakeStorage({
    [BOARD_KEY]: JSON.stringify({
      date: "2026-09-08",
      issues: [
        {
          id: "a",
          projectSlug: "tns",
          title: "이슈",
          createdAt: "2026-09-08T00:00:00.000Z",
        },
      ],
      today: [],
      customProjects: [],
      projectOrder: [],
      collapsedProjects: [],
    }),
  });
  const payload = readLegacyData(storage, ["tns"]);
  assert.equal(payload.board?.issues.length, 1);
  assert.equal(hasLegacyData(payload), true);
});

test("프로젝트별 명심할 점을 읽는다", () => {
  const storage = fakeStorage({
    [NOTES_KEY]: JSON.stringify([
      {
        id: "n1",
        content: "확인",
        priority: "high",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
    ]),
  });
  const payload = readLegacyData(storage, ["tns", "common"]);
  assert.deepEqual(
    payload.notes.map((entry) => [entry.projectSlug, entry.notes.length]),
    [["tns", 1]],
  );
  assert.equal(hasLegacyData(payload), true);
});

test("깨진 JSON 은 없는 것으로 다룬다", () => {
  const payload = readLegacyData(fakeStorage({ [BOARD_KEY]: "{{{" }), ["tns"]);
  assert.equal(payload.board, null);
  assert.equal(hasLegacyData(payload), false);
});

test("빈 보드만 있으면 이관할 게 없다", () => {
  const storage = fakeStorage({
    [BOARD_KEY]: JSON.stringify({
      date: "2026-09-08",
      issues: [],
      today: [],
      customProjects: [],
      projectOrder: [],
      collapsedProjects: [],
    }),
  });
  assert.equal(hasLegacyData(readLegacyData(storage, ["tns"])), false);
});

test("지우면 키가 사라진다", () => {
  const storage = fakeStorage({ [BOARD_KEY]: "{}", [NOTES_KEY]: "[]" });
  clearLegacyData(storage, ["tns"]);
  assert.equal(storage.has(BOARD_KEY), false);
  assert.equal(storage.has(NOTES_KEY), false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test lib/import-legacy.test.mjs`
Expected: FAIL — `./import-legacy.ts` 를 찾을 수 없다

- [ ] **Step 3: 이관 읽기 모듈 구현**

`lib/import-legacy.ts`:

```ts
/* -------------------------------------------------------------------------
 * 서버 저장으로 넘어오기 전 브라우저에 쌓인 값을 읽어 올릴 모양으로 만든다.
 *
 * 저장소를 인자로 받는다. 그래야 테스트가 가짜 저장소를 넣을 수 있다.
 * ---------------------------------------------------------------------- */

import {
  normalizeProjectNotes,
  projectNotesStorageKey,
  type ProjectNote,
} from "@/lib/project-notes";
import {
  normalizeTodayBoard,
  TODAY_BOARD_STORAGE_KEY,
  type TodayBoard,
} from "@/lib/today-board";

export type LegacyPayload = {
  board: TodayBoard | null;
  notes: { projectSlug: string; notes: ProjectNote[] }[];
};

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readLegacyData(
  storage: Pick<Storage, "getItem">,
  projectSlugs: string[],
): LegacyPayload {
  const rawBoard = parse(storage.getItem(TODAY_BOARD_STORAGE_KEY));
  const board = rawBoard ? normalizeTodayBoard(rawBoard) : null;

  const notes: LegacyPayload["notes"] = [];
  for (const projectSlug of projectSlugs) {
    const parsed = parse(storage.getItem(projectNotesStorageKey(projectSlug)));
    const list = normalizeProjectNotes(parsed);
    if (list.length > 0) notes.push({ projectSlug, notes: list });
  }

  return { board, notes };
}

/** 올릴 내용이 실제로 있는지. 빈 보드만 있으면 올리지 않는다. */
export function hasLegacyData(payload: LegacyPayload): boolean {
  const board = payload.board;
  const boardHasSomething = Boolean(
    board &&
      (board.issues.length > 0 ||
        board.today.length > 0 ||
        board.customProjects.length > 0),
  );
  return boardHasSomething || payload.notes.length > 0;
}

export function clearLegacyData(
  storage: Pick<Storage, "removeItem">,
  projectSlugs: string[],
): void {
  storage.removeItem(TODAY_BOARD_STORAGE_KEY);
  for (const projectSlug of projectSlugs) {
    storage.removeItem(projectNotesStorageKey(projectSlug));
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test lib/import-legacy.test.mjs`
Expected: PASS

- [ ] **Step 5: 저장소에 비어있음 판정과 일괄 넣기 추가**

`lib/server/board-store.ts` 끝에 더한다.

```ts
/** 이슈·프로젝트·명심할 점이 모두 없을 때만 비어 있다고 본다. */
export async function isBoardEmpty(): Promise<boolean> {
  const [issues, projects, notes] = await Promise.all([
    prisma.issue.count(),
    prisma.customProject.count(),
    prisma.projectNote.count(),
  ]);
  return issues === 0 && projects === 0 && notes === 0;
}

/**
 * 브라우저에서 올라온 값을 한 트랜잭션에 넣는다. 완료 이력은 저장된 적이 없어
 * 이관 대상이 아니다. 오늘 목록은 넘어온 순서대로 오늘 날짜를 달아 넣는다.
 */
export async function importLegacy(payload: {
  board: TodayBoard | null;
  notes: { projectSlug: string; notes: ProjectNote[] }[];
  today: string;
  now: string;
}): Promise<void> {
  const board = payload.board;

  await prisma.$transaction(async (tx) => {
    if (board) {
      for (const project of board.customProjects) {
        await tx.customProject.create({
          data: {
            slug: project.slug,
            title: project.title,
            createdAt: new Date(project.createdAt || payload.now),
          },
        });
      }

      for (const [index, issue] of board.issues.entries()) {
        await tx.issue.create({
          data: {
            id: issue.id,
            projectSlug: issue.projectSlug,
            title: issue.title,
            createdAt: new Date(issue.createdAt || payload.now),
            placement: "pool",
            todayDate: null,
            done: false,
            position: index,
          },
        });
      }

      for (const [index, item] of board.today.entries()) {
        await tx.issue.create({
          data: {
            id: item.id,
            projectSlug: item.projectSlug,
            title: item.title,
            createdAt: new Date(item.createdAt || payload.now),
            placement: "today",
            todayDate: payload.today,
            done: item.done,
            position: index,
          },
        });
      }

      await tx.appSetting.upsert({
        where: { key: BOARD_SETTING_KEY },
        create: {
          key: BOARD_SETTING_KEY,
          value: {
            projectOrder: board.projectOrder,
            collapsedProjects: board.collapsedProjects,
          },
        },
        update: {
          value: {
            projectOrder: board.projectOrder,
            collapsedProjects: board.collapsedProjects,
          },
        },
      });
    }

    for (const entry of payload.notes) {
      for (const [index, note] of entry.notes.entries()) {
        await tx.projectNote.create({
          data: {
            id: note.id,
            projectSlug: entry.projectSlug,
            content: note.content,
            priority: note.priority,
            position: index,
            updatedAt: new Date(note.updatedAt || payload.now),
          },
        });
      }
    }
  });
}
```

파일 위쪽 import 에 `ProjectNote` 를 더한다.

```ts
import type { ProjectNote } from "@/lib/project-notes";
```

- [ ] **Step 6: 이관 라우트**

`app/api/import/route.ts`:

```ts
import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api-types";
import { importLegacy, isBoardEmpty } from "@/lib/server/board-store";
import { normalizeProjectNotes, type ProjectNote } from "@/lib/project-notes";
import { normalizeTodayBoard, todayDateString } from "@/lib/today-board";

export async function POST(request: Request) {
  if (!(await isBoardEmpty())) {
    return jsonError("서버에 이미 내용이 있어 이관하지 않았습니다.", 409);
  }

  const body = await readJson(request);
  const board = body.board ? normalizeTodayBoard(body.board) : null;

  const notes: { projectSlug: string; notes: ProjectNote[] }[] = [];
  if (Array.isArray(body.notes)) {
    for (const entry of body.notes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as { projectSlug?: unknown; notes?: unknown };
      if (typeof record.projectSlug !== "string") continue;
      const list = normalizeProjectNotes(record.notes);
      if (list.length > 0) notes.push({ projectSlug: record.projectSlug, notes: list });
    }
  }

  await importLegacy({
    board,
    notes,
    today: todayDateString(new Date()),
    now: new Date().toISOString(),
  });

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 7: 첫 로드에서 이관을 시도한다**

`components/today-board/today-board.tsx` 의 첫 로드 `useEffect` 를 바꾼다.

```tsx
const projectSlugs = useMemo(
  () => flowProjects.map((project) => project.slug),
  [],
);

useEffect(() => {
  let cancelled = false;

  const start = async () => {
    let loaded: TodayBoard;
    try {
      loaded = await fetchBoard();
    } catch {
      if (!cancelled) setStorageError("서버에서 내용을 불러오지 못했습니다.");
      return;
    }

    // 서버가 비어 있을 때만 브라우저에 남은 옛 데이터를 올린다.
    const serverEmpty =
      loaded.issues.length === 0 &&
      loaded.today.length === 0 &&
      loaded.customProjects.length === 0;

    if (serverEmpty) {
      try {
        const payload = readLegacyData(window.localStorage, projectSlugs);
        if (hasLegacyData(payload)) {
          await postImport(payload);
          clearLegacyData(window.localStorage, projectSlugs);
          loaded = await fetchBoard();
        }
      } catch {
        // 이관에 실패해도 앱은 열려야 한다. 브라우저 값은 지우지 않는다.
      }
    }

    if (!cancelled) {
      setBoard(loaded);
      setStorageError(null);
    }
  };

  void start();
  return () => {
    cancelled = true;
  };
}, [projectSlugs]);
```

`lib/api-client.ts` 에 `postImport` 를 더한다.

```ts
import type { LegacyPayload } from "@/lib/import-legacy";

export async function postImport(payload: LegacyPayload): Promise<void> {
  await request("/api/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
```

명심할 점 이관은 보드 화면에서 한 번에 처리하므로 표 컴포넌트는 손대지 않는다.

- [ ] **Step 8: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck`
Expected: 모두 통과

- [ ] **Step 9: 수동 확인**

1. 테스트 DB 가 아닌 개발 DB 의 테이블을 비운다.

```bash
psql project_management -c 'TRUNCATE TABLE "completion", "issue", "project_note", "custom_project", "app_setting" CASCADE'
```

2. 브라우저 개발자도구 콘솔에서 옛 데이터를 심는다.

```js
localStorage.setItem(
  "project-management.today-board.v1",
  JSON.stringify({
    date: "2026-09-08",
    issues: [{ id: "old-1", projectSlug: "tns", title: "옛 이슈", createdAt: "2026-09-08T00:00:00.000Z" }],
    today: [],
    customProjects: [],
    projectOrder: [],
    collapsedProjects: [],
  }),
);
```

3. `/today` 를 새로고침한다.

Expected: "옛 이슈" 가 보이고, `localStorage` 에서 그 키가 사라져 있다. 한 번 더 새로고침해도 이슈가 중복되지 않는다.

- [ ] **Step 10: 커밋**

```bash
git add lib/import-legacy.ts lib/import-legacy.test.mjs lib/api-client.ts lib/server/board-store.ts app/api/import components/today-board/today-board.tsx
git commit -m "feat: localStorage 데이터 첫 접속 자동 이관 추가"
```

---

### Task 11: 완료 이력 화면

**Files:**
- Create: `lib/server/history-store.ts`
- Create: `lib/server/history-store.test.mjs`
- Create: `app/api/history/route.ts`
- Create: `app/today/history/page.tsx`
- Create: `components/today-board/completion-history.tsx`
- Modify: `lib/api-client.ts`
- Modify: `app/today/page.tsx`

**Interfaces:**
- Consumes: `prisma` (Task 1), `groupCompletionsByDate`, `type Completion`, `type CompletionDay` (Task 4), `flowProjects` (`lib/flows/registry.ts`), `prisma.customProject`
- Produces:
  - `listCompletions(from: string, to: string): Promise<Completion[]>`
  - `GET /api/history?from=&to=` → `{ completions: Completion[]; customProjects: CustomProject[]; projectOrder: string[] }`
  - `fetchHistory(from: string, to: string): Promise<HistoryResponse>` (`lib/api-client.ts`)
  - `type HistoryResponse` (`lib/api-client.ts`)
  - `<CompletionHistory />` 클라이언트 컴포넌트

- [ ] **Step 1: 저장소 테스트를 먼저 쓴다**

`lib/server/history-store.test.mjs`:

```js
import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma, resetDatabase } from "./test-db.mjs";

const store = await import("./history-store.ts");

beforeEach(resetDatabase);
after(() => prisma.$disconnect());

async function addCompletion(id, completedOn, title = `일 ${id}`) {
  await prisma.completion.create({
    data: {
      id,
      issueId: null,
      projectSlug: "tns",
      title,
      completedOn,
      completedAt: new Date(`${completedOn}T09:00:00.000Z`),
    },
  });
}

test("범위 안의 이력만 준다", async () => {
  await addCompletion("a", "2026-09-01");
  await addCompletion("b", "2026-09-05");
  await addCompletion("c", "2026-09-10");

  const rows = await store.listCompletions("2026-09-02", "2026-09-09");
  assert.deepEqual(rows.map((row) => row.id), ["b"]);
});

test("경계 날짜를 포함한다", async () => {
  await addCompletion("a", "2026-09-02");
  await addCompletion("b", "2026-09-09");

  const rows = await store.listCompletions("2026-09-02", "2026-09-09");
  assert.deepEqual(rows.map((row) => row.id).sort(), ["a", "b"]);
});

test("완료 날짜 내림차순으로 준다", async () => {
  await addCompletion("a", "2026-09-03");
  await addCompletion("b", "2026-09-07");
  await addCompletion("c", "2026-09-05");

  const rows = await store.listCompletions("2026-09-01", "2026-09-09");
  assert.deepEqual(rows.map((row) => row.id), ["b", "c", "a"]);
});

test("이력이 없으면 빈 배열", async () => {
  assert.deepEqual(await store.listCompletions("2026-09-01", "2026-09-09"), []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test lib/server/history-store.test.mjs`
Expected: FAIL — `./history-store.ts` 를 찾을 수 없다

- [ ] **Step 3: 저장소 구현**

`lib/server/history-store.ts`:

```ts
import type { Completion } from "@/lib/completions";
import { prisma } from "@/lib/db";

/** from 과 to 를 모두 포함한다. 둘 다 로컬 기준 YYYY-MM-DD. */
export async function listCompletions(
  from: string,
  to: string,
): Promise<Completion[]> {
  const rows = await prisma.completion.findMany({
    where: { completedOn: { gte: from, lte: to } },
    orderBy: [{ completedOn: "desc" }, { completedAt: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    projectSlug: row.projectSlug,
    title: row.title,
    completedOn: row.completedOn,
    completedAt: row.completedAt.toISOString(),
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test lib/server/history-store.test.mjs`
Expected: PASS

- [ ] **Step 5: 이력 라우트**

`app/api/history/route.ts`:

```ts
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-types";
import { prisma } from "@/lib/db";
import { listCompletions } from "@/lib/server/history-store";
import { BOARD_SETTING_KEY } from "@/lib/server/board-store";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return jsonError("from 과 to 는 YYYY-MM-DD 형식이어야 합니다.", 400);
  }
  if (from > to) return jsonError("from 이 to 보다 늦습니다.", 400);

  const [completions, projects, setting] = await Promise.all([
    listCompletions(from, to),
    prisma.customProject.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.appSetting.findUnique({ where: { key: BOARD_SETTING_KEY } }),
  ]);

  const value = (setting?.value ?? {}) as { projectOrder?: unknown };
  const projectOrder = Array.isArray(value.projectOrder)
    ? value.projectOrder.filter((entry): entry is string => typeof entry === "string")
    : [];

  return NextResponse.json({
    completions,
    customProjects: projects.map((project) => ({
      slug: project.slug,
      title: project.title,
      createdAt: project.createdAt.toISOString(),
    })),
    projectOrder,
  });
}
```

- [ ] **Step 6: fetch 래퍼에 이력 함수 추가**

`lib/api-client.ts` 에 더한다.

```ts
import type { Completion } from "@/lib/completions";

export type HistoryResponse = {
  completions: Completion[];
  customProjects: CustomProject[];
  projectOrder: string[];
};

export async function fetchHistory(
  from: string,
  to: string,
): Promise<HistoryResponse> {
  const response = await request(
    `/api/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  return response.json();
}
```

- [ ] **Step 7: 이력 컴포넌트**

`components/today-board/completion-history.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchHistory, type HistoryResponse } from "@/lib/api-client";
import { groupCompletionsByDate } from "@/lib/completions";
import { flowProjects } from "@/lib/flows/registry";
import { todayDateString } from "@/lib/today-board";

/** 한 번에 불러오는 기간. 더 보기를 누를 때마다 이만큼 과거로 넓힌다. */
const WINDOW_DAYS = 30;

function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return todayDateString(parsed);
}

/** "2026-09-09" → "2026년 9월 9일" */
function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function CompletionHistory() {
  const today = useMemo(() => todayDateString(new Date()), []);
  const [days, setDays] = useState(WINDOW_DAYS);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  const projects = useMemo(
    () => flowProjects.map(({ slug, title }) => ({ slug, title })),
    [],
  );

  const load = useCallback(async () => {
    setPending(true);
    try {
      setData(await fetchHistory(shiftDate(today, -(days - 1)), today));
      setError(null);
    } catch {
      setError("이력을 불러오지 못했습니다.");
    } finally {
      setPending(false);
    }
  }, [days, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () =>
      data
        ? groupCompletionsByDate(
            data.completions,
            projects,
            data.customProjects,
            data.projectOrder,
          )
        : [],
    [data, projects],
  );

  if (pending && !data) {
    return (
      <p className="py-10 text-center text-[12px] text-[var(--bi-muted)]">
        이력을 불러오는 중입니다.
      </p>
    );
  }

  if (error) {
    return <p className="py-10 text-center text-[12px] text-[var(--bi-error)]">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {grouped.length === 0 ? (
        <p className="py-10 text-center text-[12px] text-[var(--bi-muted)]">
          최근 {days}일 안에 완료한 항목이 없습니다.
        </p>
      ) : (
        grouped.map((day) => (
          <section
            className="rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)]"
            key={day.date}
          >
            <h2 className="border-b border-[var(--bi-border)] px-4 py-2.5 text-[12px] font-semibold text-[var(--bi-fg)]">
              {formatDate(day.date)}
              <span className="ml-2 font-normal text-[var(--bi-muted)]">
                {day.groups.reduce((sum, group) => sum + group.issues.length, 0)}건
              </span>
            </h2>
            <div className="flex flex-col gap-3 px-4 py-3">
              {day.groups.map((group) => (
                <div key={group.slug ?? "ungrouped"}>
                  <p className="mb-1 text-[11px] font-semibold text-[var(--bi-muted)]">
                    {group.title}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {group.issues.map((issue) => (
                      <li className="text-[13px] text-[var(--bi-fg)]" key={issue.id}>
                        {issue.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <button
        className="mx-auto rounded border border-[var(--bi-border-strong)] px-3 py-1.5 text-[12px] text-[var(--bi-fg)] disabled:opacity-50"
        disabled={pending}
        onClick={() => setDays((current) => current + WINDOW_DAYS)}
        type="button"
      >
        {pending ? "불러오는 중…" : `이전 ${WINDOW_DAYS}일 더 보기`}
      </button>
    </div>
  );
}
```

- [ ] **Step 8: 이력 페이지**

`app/today/history/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { CompletionHistory } from "@/components/today-board/completion-history";

export const metadata: Metadata = {
  title: "완료 이력 — 프로젝트 매니지먼트",
  description: "날짜별로 완료한 항목을 봅니다.",
};

export default function TodayHistoryPage() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description="날짜별로 완료한 항목을 봅니다. 체크한 순간의 날짜로 쌓입니다."
        title="완료 이력"
      />
      <div className="px-6 py-5">
        <nav
          aria-label="위치"
          className="mb-3 flex items-center gap-1.5 text-[11px] text-[var(--bi-muted)]"
        >
          <Link className="hover:underline" href="/today">
            오늘의 할 일
          </Link>
          <span aria-hidden>›</span>
          <span className="font-semibold text-[var(--bi-fg)]">완료 이력</span>
        </nav>
        <CompletionHistory />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: 오늘의 할 일 화면에 링크**

`app/today/page.tsx` 의 `PageHeader` 아래에 링크를 더한다. `PageHeader` 가 `children` 이나 액션 슬롯을 받지 않으면 헤더 바로 아래 줄에 둔다.

```tsx
<div className="px-6 pt-3">
  <Link
    className="text-[12px] text-[var(--bi-muted)] hover:text-[var(--bi-fg)] hover:underline"
    href="/today/history"
  >
    완료 이력 보기 →
  </Link>
</div>
```

`import Link from "next/link";` 를 더한다.

- [ ] **Step 10: 전체 테스트와 타입 검사**

Run: `pnpm test && pnpm typecheck`
Expected: 모두 통과

- [ ] **Step 11: 수동 확인**

1. 오늘의 할 일에서 항목 두어 개를 체크한다.
2. `/today/history` 로 간다.

Expected: 오늘 날짜 아래 방금 체크한 항목이 프로젝트별로 보인다.

3. 체크를 푼 뒤 이력을 새로고침한다.

Expected: 그 항목이 사라진다.

4. 오늘의 할 일에서 링크가 보이고 눌리면 이력으로 간다.

- [ ] **Step 12: 커밋**

```bash
git add lib/server/history-store.ts lib/server/history-store.test.mjs app/api/history app/today/history components/today-board/completion-history.tsx lib/api-client.ts app/today/page.tsx
git commit -m "feat: 날짜별 완료 이력 화면 추가"
```

---

### Task 12: 배포 구성

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`
- Create: `docs/deploy.md`
- Modify: `next.config.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 부터 11 까지의 앱 전체
- Produces: OCI 인스턴스에서 `docker compose up -d` 로 뜨는 앱 컨테이너

- [ ] **Step 1: standalone 출력**

`next.config.ts` 의 `nextConfig` 에 더한다.

```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions: ["ts", "tsx", "mdx"],
  // 컨테이너 이미지를 가볍게 한다. 실행에 필요한 것만 .next/standalone 에 모인다.
  output: "standalone",
};
```

- [ ] **Step 2: 도커 무시 목록**

`.dockerignore`:

```
node_modules
.next
.git
.env
.env.local
docs
*.md
tsconfig.tsbuildinfo
```

- [ ] **Step 3: Dockerfile**

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /app

# --- 의존성 ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- 빌드 ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma 클라이언트는 빌드 전에 만들어져 있어야 한다.
RUN pnpm exec prisma generate
RUN pnpm build

# --- 실행 ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=30001

# standalone 출력에는 실행에 필요한 node_modules 만 들어 있다.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 마이그레이션을 컨테이너 시작 때 적용하려면 prisma CLI 와 스키마, 설정이 필요하다.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 30001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node server.js"]
```

이 저장소에는 `public` 디렉터리가 없으므로 그것을 복사하는 줄도 없다. 나중에
`public` 을 만들면 `COPY --from=builder /app/public ./public` 을 더한다.

- [ ] **Step 4: Compose 파일**

`docker-compose.yml`:

```yaml
# PostgreSQL 은 이 인스턴스에 이미 떠 있는 컨테이너를 쓴다. 여기서 새로 띄우지 않는다.
services:
  app:
    build: .
    container_name: project-management
    restart: unless-stopped
    ports:
      - "30001:30001"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      APP_PASSWORD_HASH: ${APP_PASSWORD_HASH}
      SESSION_SECRET: ${SESSION_SECRET}
    networks:
      - db

networks:
  db:
    # 이미 돌고 있는 PostgreSQL 컨테이너가 붙어 있는 네트워크 이름으로 바꾼다.
    # `docker network ls` 로 확인한다.
    external: true
    name: ${DB_NETWORK_NAME}
```

- [ ] **Step 5: 배포 문서**

`docs/deploy.md`:

```markdown
# OCI 배포

PostgreSQL 은 인스턴스에 이미 떠 있는 컨테이너를 쓴다. 새로 띄우지 않는다.

## 처음 한 번

1. PostgreSQL 컨테이너가 붙은 네트워크 이름을 확인한다.

   ```bash
   docker network ls
   docker inspect <postgres 컨테이너> --format '{{json .NetworkSettings.Networks}}'
   ```

2. 데이터베이스를 만든다.

   ```bash
   docker exec -it <postgres 컨테이너> createdb -U postgres project_management
   ```

3. 비밀번호 해시를 만든다. 로컬에서 돌린다.

   ```bash
   node scripts/hash-password.mjs
   ```

4. 서명 키를 만든다.

   ```bash
   openssl rand -hex 32
   ```

5. 인스턴스의 저장소 루트에 `.env` 를 만든다.

   ```
   DATABASE_URL=postgresql://postgres:<비밀번호>@<postgres 컨테이너 이름>:5432/project_management
   APP_PASSWORD_HASH=<3번 결과>
   SESSION_SECRET=<4번 결과>
   DB_NETWORK_NAME=<1번에서 확인한 이름>
   ```

   `.env` 는 커밋하지 않는다.

## 띄우기

```bash
docker compose up -d --build
```

마이그레이션은 컨테이너가 시작할 때 자동으로 적용된다.

## 로그와 재시작

```bash
docker compose logs -f app
docker compose restart app
```

## 백업

```bash
docker exec <postgres 컨테이너> pg_dump -U postgres project_management \
  | gzip > backup-$(date +%F).sql.gz
```

크론에 걸어 두고 결과를 OCI Object Storage 로 올리면 된다.
```

- [ ] **Step 6: README 갱신**

`README.md` 를 고친다.

1. 스택 표에 `데이터베이스 | PostgreSQL + Prisma` 줄을 더한다.
2. 라우트 표의 `/today` 설명에서 브라우저 저장 언급을 서버 저장으로 바꾸고, `/today/history` 와 `/login` 줄을 더한다.
3. `/flows/[project]/notes` 설명의 "브라우저 자동 저장" 을 "서버 자동 저장" 으로 바꾼다.
4. 실행 절 앞에 환경변수 설정을 더한다.

```markdown
## 환경변수

`.env.example` 을 `.env` 로 복사해 채운다.

| 이름 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 문자열 |
| `TEST_DATABASE_URL` | 통합 테스트용 별도 데이터베이스 |
| `APP_PASSWORD_HASH` | `node scripts/hash-password.mjs` 결과 |
| `SESSION_SECRET` | `openssl rand -hex 32` 결과 |
```

5. 실행 절에 다음을 더한다.

```bash
pnpm db:migrate   # 마이그레이션 적용
pnpm test         # node --test
```

6. 디렉터리 절에 `prisma/`, `lib/server/`, `middleware.ts`, `app/api/`, `app/login/` 을 더한다.

- [ ] **Step 7: 로컬 빌드 확인**

Run: `pnpm build`
Expected: 빌드 성공. `.next/standalone/server.js` 가 생긴다.

- [ ] **Step 8: 이미지 빌드 확인**

Run: `docker build -t project-management .`
Expected: 빌드 성공. Docker 가 없는 환경이면 이 단계를 건너뛰고 OCI 에서 확인한다.

- [ ] **Step 9: 전체 검증**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 모두 통과

- [ ] **Step 10: 커밋**

```bash
git add Dockerfile .dockerignore docker-compose.yml docs/deploy.md next.config.ts README.md
git commit -m "feat: OCI 배포용 Docker 구성과 문서 추가"
```

---

## 완료 조건

모두 만족해야 끝난 것이다.

- [ ] `pnpm test` 통과
- [ ] `pnpm typecheck` 통과
- [ ] `pnpm build` 통과
- [ ] 로그인하지 않으면 `/today` 가 `/login` 으로 넘어간다
- [ ] 두 브라우저에서 같은 할 일과 명심할 점이 보인다
- [ ] 브라우저에 있던 옛 데이터가 첫 접속에 한 번 올라가고 중복되지 않는다
- [ ] 체크한 항목이 `/today/history` 에 날짜별로 보인다
- [ ] 체크를 풀면 이력에서 사라진다
- [ ] 비밀번호와 서명 키가 저장소 어디에도 문자열로 들어있지 않다
- [ ] 커밋 메시지에 `Co-Authored-By` 트레일러가 없다
