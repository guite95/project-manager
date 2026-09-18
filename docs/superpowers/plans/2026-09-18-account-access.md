# Account Access Implementation Plan

**Goal:** 계정별 프로젝트 조회·쓰기와 단일 페이지 공개 공유를 제공한다.
**Architecture:** DB 세션, 중앙 경로 정책, 프로젝트별 membership, 별도 share 렌더러를 사용한다.
**Tech Stack:** Next.js, Prisma/PostgreSQL, 기존 scrypt password helper.
**Spec:** ../specs/2026-09-18-account-access-design.md

## Constraints
운영 DB 쓰기·배포 없이 구현과 로컬 검증을 완료한다. 기존 자료를 보존한다. 새 경로는 기본 거부한다. 소유자 전용 데이터는 다른 관리자에게도 공개하지 않는다.

## Tasks
- [x] 1. `lib/access/policy.ts`와 정책 테스트: role/project/method 매트릭스, 개인 프로젝트 및 미등록 경로 거부.
- [x] 2. Prisma 추가 migration과 `lib/access/store.ts`: 계정, 세션, 초대, membership, 공유, 감사 로그. 원자적 OWNER bootstrap·초대 소비, session revoke, rate limit. 로컬 DB 통합 테스트.
- [x] 3. `proxy.ts`, API와 서버 컴포넌트: 매 요청 DB 세션/권한 조회, CSRF, 목록 필터, owner-only AI, notes reorder 범위 검증.
- [x] 4. 로그인/초대/설정 UI: 계정 로그인, OWNER 등록, 초대·권한 변경·비활성화·공유 생성과 회수. 하위 에이전트에 UI 구현을 분리하고 직접 검토한다.
- [x] 5. 공유 페이지와 역할별 UI: 독립 읽기 화면, 제한 메뉴, 편집·삭제 제어.
- [x] 6. focused tests, 전체 테스트, typecheck, build, 접근 제어 코드 리뷰. README/AGENTS와 운영 전환 순서 기록.

## Execution decisions
- 기존 깨끗한 체크아웃에서 `feat/account-project-access` 브랜치로 분리한다. 사용자가 요청한 구현을 계속하며 설계 승인을 반복 요청하지 않는다.
- API 계약은 `docs/account-access.md`에 기록해 UI 작업과 서버 작업이 일치하도록 한다.
- 전체 테스트 303 PASS/5 SKIP 후 동시 권한 변경 회귀 테스트를 추가해 접근 제어 focused 15 PASS. typecheck/build PASS, 실제 Next 앱의 로컬 HTTP 검사 40 PASS. 브라우저 미실행.
- 별도 리뷰에서 URL 인코딩 개인 프로젝트 우회, 초대 역할 변경 경합, 비밀번호 변경/로그인 경합을 찾아 수정했고 재검토에서 차단 이슈 없음.
- 운영 DB 읽기 전용 검사: 기존 프로젝트 7개/문서 56개, 계정 테이블 미적용. 운영 backup/migrate/deploy, 커밋/푸시는 수행하지 않았다.
- 동시 작업의 개인 프로젝트 분류 관련 변경을 발견했으며 그대로 보존했다.
