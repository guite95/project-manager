# 개인 지원 현황과 MCP 구현 계획

**Goal:** 지원 건에서 공고·경험·자소서·개인 할 일을 연결하고 웹과 MCP에서 같은 권한 및 수정 규칙을 적용한다.
**Architecture:** 기존 app_setting JSON 저장, issue 일정과 완료 이력, Career MCP/OAuth를 확장한다. UI와 OAuth는 독립 파일 범위로 병렬 구현하고 저장소 및 MCP를 통합한다.
**Tech Stack:** Next.js, TypeScript, Zod, Prisma/PostgreSQL, MCP SDK, Better Auth.
**Spec:** `docs/superpowers/specs/2026-10-09-career-applications-design.md`

## 공통 제약

- 개인 업무 에이전트 접근은 MCP만. 신규 개인 CLI 없음.
- OWNER, OAuth epoch, revision, requestId, linked task version 검사.
- 운영 DB와 배포 변경 없음. 테스트 DB는 로컬 project_management_test만.
- 공통 UI 사용, 브라우저 검증 없음, 개인 자료/시크릿을 코드에 저장하지 않음.
- 사용자 실행 요청에 따라 재확인 없이 구현하며 커밋·푸시는 하지 않음.

## 작업

- [x] 도메인: `lib/recruitment-applications.ts` 타입과 입력 검증, 마감 시간대·제외 사유·중복 연결 회귀 테스트.
- [x] 저장소/HTTP: `lib/server/recruitment-applications-store.ts`, applications API. OWNER 재검사와 요청 원자성, 이력/복원, 문서 종류/공고/태스크 연결 검증. 동시 저장과 requestId 충돌 테스트.
- [x] 태스크 경계: 지원 건에 개인 issue 연결/생성/수정. board-store의 회사 이동 방지·완료 이월 보존과 project-tasks CLI 필터. 완료 이력 원자성과 stale version 테스트.
- [x] UI: 지원 현황 목록/상세/편집, 자료 연결·할 일 편집·이력 복원. 공고에서 지원 건 생성 진입 및 메뉴. 편집 중 자동 갱신 덮어쓰기 방지.
- [x] OAuth: Hermes의 지원 방식을 확인하고 고정 등록 클라이언트 확장. 기존 ChatGPT와 PKCE/browser binding/revocation 보존 테스트.
- [x] MCP: 기존 Career 도구에 지원 현황·공고·태스크·미평가 초안 저장 추가. scope, owner, 명시적 저장 의도와 인자 검증 테스트.
- [x] 통합 검증: 집중 테스트, `pnpm typecheck`, `pnpm build`, 변경 diff 검토. 로컬 코드와 운영 적용 상태를 구분해 문서화.

## 완료 검증 — 2026-10-09

- 집중 통합 검사 123개 통과. 이후 입력 날짜 검증 7개 추가 통과, 저장소 11개 재검사 통과(서로 다른 테스트 총 130개).
- 실제 Better Auth + 로컬 테스트 DB의 OAuth 검사 20개를 집중 검사에 포함했다. 공유 DB는 읽거나 쓰지 않았다.
- `pnpm typecheck`, `git diff --check` 통과.
- 기본 `pnpm build`는 Turbopack의 내부 포트 바인딩 `Operation not permitted`로 실패했다. `pnpm build --webpack`은 컴파일·타입·페이지 생성·trace까지 통과했다.
- 브라우저·운영 DB·배포·실제 Hermes 로그인은 실행하지 않았다. 새 서버/터널을 띄우지 않았다. 변경은 `feat/career-applications-mcp` 브랜치의 미커밋 상태다.
- 사용·저장 규칙: `docs/recruitment-applications.md`. 추가 OAuth client와 Hermes 연결 절차: `docs/career-oauth.md`.

## 검토 초점

1. 연결 자료가 삭제되었을 때 상세는 누락을 표시하고 저장/복원이 잘못된 링크를 재생성하지 않는다.
2. 동일 요청의 네트워크 재시도가 이슈/초안/완료 이력을 중복 생성하지 않는다.
3. 태스크 완료·이월·회사 이동으로 개인 정보 분류가 사라지지 않는다.
4. OAuth 클라이언트 ID와 콜백을 서로 섞거나 임의 주소를 쓰면 거부한다.
5. UI에서 저장 실패나 늦은 읽기 응답이 사용자가 편집 중인 내용을 지우지 않는다.
