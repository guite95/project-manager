# OCI Vault Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 VM의 인프라·서비스 자격증명을 사용자 지정 새 값으로 분리·교체하고 Vault에서 전달한다.

**Architecture:** 호스트를 공통 신뢰 영역으로 유지한다. 앱의 인스턴스 신원 접근을 먼저 제거하고 호스트의 고정 manifest로 서비스별 Secret을 tmpfs 파일에 배치한다. 실제 계정 전환과 배포는 서비스별로 나눠 검증한다.

**Tech Stack:** OCI Vault/Secret Management, Instance Principal, systemd, Docker Compose, PostgreSQL, MySQL, Redis ACL, RabbitMQ, MinIO, Node/Python/Spring.

**Spec:** `docs/superpowers/specs/2026-09-20-oci-vault-single-vm-design.md`.

## 2026-09-21 실행 순서 및 승인 갱신

- 사용자 승인: PM → Flight → YouTube Sync → Ilchul 순서로 진행한다.
- PM/Flight/YouTube Sync는 검증 후 main 반영·push 및 해당 전환을 진행한다. 자동 배포 전에 호스트 준비를 확인한다.
- Ilchul은 마지막이며 사용자와 함께 실제 전환한다. Ilchul main push/배포/계정 전환은 이번 자동 진행 범위에서 제외한다.
- Ilchul이 사용하는 공유 Redis/MinIO/DB의 기존 계정·비밀번호·권한은 Ilchul 전환 전 폐기하지 않는다. 다른 앱은 새 전용 계정을 병행 생성해 먼저 옮긴다.
- 전체 재부팅 및 추가 유료 리소스는 기존 별도 승인 경계를 유지한다.

**Status:** 2026-09-21 사용자 지시로 자격증명 입력 이전의 PM 신원 분리 로컬 준비 작업을 인라인으로 진행했다.
후속 요청으로 기존 서명/외부 키 15개를 입력 파일에 채웠고, 사용자가 나머지 입력 완료 후 재개를 요청했다.
로컬 사전 검사에서 발견한 중복·짧은 비밀번호는 후속 사용자 요청에 따라 인프라/서비스 19개를
서로 다른 16자리 암호학적 무작위 값으로 생성해 해결했다. 최신 파일에서 YouTube Redis 사용자명도
서로 다름을 확인했다(에이전트가 사용자명을 변경한 것은 아님). 전체 형식/운영 사전 검증은 여전히 별도다.
입력 사전 검사 결과는 `ops/oci-runtime/credential-preflight.md`, PM 구현 상태는
`2026-09-20-pm-oci-identity-boundary.md`와 `ops/oci-runtime/verification.md` 참조.
실제 계정/Vault 전환은 아직 실행하지 않았다.

## Global Constraints

- 사용자 지정값 또는 사용자가 명시적으로 생성을 요청한 값만 사용한다. 2026-09-21 요청으로 인프라/서비스 비밀번호19개를 생성했다. 빈 값은 미입력이며 임의 생성·기존값 재사용·빈 비밀번호 적용을 뜻하지 않는다.
- 입력 파일 `.private/oci-vault-credentials.json`은 사용자의 명시적 보관 요청으로 **삭제하지 않는다**. Vault 전환 후에도 자동 삭제하지 않는다. Git/Docker 제외, 디렉터리0700/파일0600을 유지한다. 평문 로컬 사본이라는 잔존 위험은 별도로 기록하고, 운영 런타임은 이 파일 대신 Vault를 사용한다.
- 사용자 재개 전 입력값을 읽거나 운영에 적용하지 않는다. 적용 시 값·hash·접속 URL을 출력하지 않고 항목 이름과 검사 결과만 출력한다.
- 새 값은 쉘 코드/SQL 문자열 연결/프로세스 인수에 삽입하지 않는다. SDK 또는 안전한 바인딩·stdin 경로로 처리한다.
- 키를 `.env`, 이미지, CI 로그에 다시 저장하지 않는다. 새 OCI 장기 API 키를 발급하지 않는다.
- DB를 public에 열지 않는다. VocaTest 정지와 Conkiri 사고 증거를 보존한다.
- root/특권 모니터링의 공통 신뢰 영역 위험은 남는다. 엄격한 서비스별 OCI IAM 분리라고 보고하지 않는다.
- 전체 재부팅·추가 비용·외부 제공자 권한 부족은 별도 확인한다. main 통합과 실제 배포도 별도 검증 단계다.

## Task 1: 입력값 검증과 변경 전 복구 경로 확정

**Files:** `.private/oci-vault-credentials.json` (추적 금지), 새 `ops/oci-runtime/credential-input.mjs` 및 `.test.mjs`.

- [x] 재개 후 파일 권한/소유자/정규 파일 여부를 검사한다. JSON parse 오류에서도 원문/line content를 출력하지 않는다.
- [x] 고정된 필드 allowlist로 읽고 비어 있는 필수 항목, 중복 계정명, 재사용 비밀번호, 대상별 문자/길이 제한을 값 출력 없이 검사한다. 이는 보수적인 로컬 전환 정책이며 실제 서버의 모든 정책을 검증했다는 뜻은 아니다.
- [x] 합성 fixture로 미입력·형식 오류·재사용·비밀값 비출력 테스트를 먼저 작성하고 실패/통과를 확인한다.
- [ ] 현재 계정 존재·grant·실제 소비자를 다시 조회한다. 지정 계정이 이미 존재하면 덮어쓰지 않고 중단한다.
  - 2026-09-21: PostgreSQL/local MySQL/Redis/RabbitMQ의 새 사용자명12개 충돌 없음. MinIO2개/Grafana1개/OCI MySQL2개는 미검증. 전체 grant·소비자 검증은 미완료.
- [ ] 관리형 MySQL 관리 접근, MinIO 정책 조회, 외부 키 재발급 권한을 확인한다. 불가 항목은 다른 항목의 성공으로 덮지 않는다.
- [ ] 영향 DB의 private backup을 생성하고 archive/복원 가능성을 검증한다. 복구 시험이 없으면 명시한다.

## Task 2: PM 신원 분리 구현·운영 전환

**Files:** PM 상세 계획의 Task 1–3 전체.

- [ ] Google 단기 토큰 파일 인증, Object Storage Unix socket 중계, 호스트 publisher를 상세 계획대로 구현·독립 리뷰한다.
- [ ] main 통합/배포 단계 전에 호스트 런타임 및 그룹/파일 권한을 준비한다. 현재 호스트에 native Node가 없으므로 검증된 런타임 설치가 필요하다.
- [ ] 기존 OCI 인증서 mount 제거, 앱의 IMDS 차단, 저장소/Google 기능 검증을 순서대로 수행한다.
- [ ] 새 bridge 및 Docker 재시작 후에도 IMDS 차단이 유지되도록 설치/검증 스크립트를 소스 관리한다. DNS/NTP를 통째로 막지 않는다.
- [ ] 기존 OCI 신원으로 발급된 단기 자격증명의 잔여 유효기간/정책 전파를 확인한다. 안전 경계 검증 전 Vault grant를 추가하지 않는다.

## Task 3: Vault 및 고정 manifest 전달기

**Files:** 새 `ops/oci-runtime/vault-secrets.mjs`, `.test.mjs`, `project-management-secrets.service`, 비밀 없는 manifest 예제와 설치 문서.

- [ ] 무료 한도/현재 사용량을 다시 조회하고 일반 Vault + software-protected symmetric key를 생성한다. Virtual Private Vault는 선택하지 않는다.
- [ ] Secret 단위 runtime read 권한만 추가한다. Secret 생성/버전 변경/폐기 및 IAM 관리 권한은 운영자에게만 둔다.
- [ ] `syncSecrets(manifest, sdkClient)`가 고정된 Secret ID/version만 조회하고 서비스별 tmpfs 세대를 생성하도록 한다. 파일 내용은 반환/로그하지 않는다.
- [ ] 합성 SDK 응답으로 다른 서비스 경로·symlink·부분 파일 갱신·실패 시 기존 세대 보존·버전 불일치 거부를 테스트한다.
- [ ] 여러 파일은 완전한 세대를 먼저 생성한 뒤 전환한다. 단일 파일 bind inode 갱신 문제를 피하도록 디렉터리를 mount한다.
- [ ] 재부팅 후 Vault 불가용 시 앱을 비밀값 없이 시작하지 않는다. 폐기된 버전이나 옛 `.env`로 fallback하지 않는다.

## Task 4: PM pilot과 PostgreSQL 권한 분리

**Files:** `lib/prisma.ts` 등 실제 DB 클라이언트 진입점, `scripts/with-shared-db.mjs`, `scripts/ai-ops-ingest.mjs`, `scripts/ai-ops-search.mjs`, `scripts/recordings-worker.mjs`, `Dockerfile`, Compose 및 deploy workflow.

- [ ] 사용자 지정 runtime/migration 계정을 만들고 업무 schema·sequence의 필요한 권한만 부여한다. migration 권한을 일반 앱에 주입하지 않는다.
- [ ] DB URL/legacy session 설정의 파일 읽기를 앱과 모든 worker/CLI에 일관되게 적용한다.
- [ ] 로컬 SSH 터널이 새 runtime credential을 메모리로만 읽고 새 계정명을 검증하도록 변경한다.
- [ ] Vault 파일로 전환 후 DB·로그인·자료·배치 확인. DB 사용자 세션과 legacy 서명 세션의 영향을 구분한다.
- [ ] 재배포·조회 실패·파일 교체 테스트 후 이전 자격증명을 폐기한다.

## Task 5: Flight 계정·배포 경로 전환

**Files:** `/Users/janguk/uk/flight-app/backend/database.py`, 실제 SMTP/OAuth/세션 설정 소비자, `docker-compose.yml`, `.github/workflows/deploy.yml`.

- [ ] 새 PostgreSQL runtime/migration 계정으로 superuser 의존을 제거한다. 현재 local file storage는 유지한다.
- [ ] 사용하지 않는 MinIO root 값과 불필요한 DB 관리자 env를 제거한다.
- [ ] 파일 설정 reader를 module 초기화보다 먼저 사용하고 누락 시 production SQLite 등으로 조용히 fallback하지 않는다.
- [ ] CI의 ENV_FILE 재생성 경로를 제거하고 비밀 없는 배포 설정과 서비스별 secret mount로 전환한다.
- [ ] 앱 테스트/빌드 후 DB CRUD·로그인·파일 저장·SMTP/OAuth 가용성을 항목별로 검증하고 이전 계정을 폐기한다.

## Task 6: Ilchul DB·MinIO·Redis 전환

**Files:** `/Users/janguk/uk/ilchul/backend/src/main/resources/application.yml`, `S3StorageConfig.java`, blue/green Compose 및 deploy workflow.

- [ ] runtime/Flyway 계정 분리, configtree 주입, Redis username/password 설정을 테스트 후 적용한다.
- [ ] MinIO 전용 계정에 현재 필요한 버킷/경로와 동작만 허용한다. S3Client와 S3Presigner 모두 파일 인증을 사용한다.
- [ ] blue/green 양쪽 설정 및 롤백 경로를 갱신한다. 구 버전 비밀 주입으로 돌아가지 않게 한다.
- [ ] backend tests/frontend build, Flyway/health/Nginx/auth 및 업로드 API 검증 후 기존 계정을 폐기한다.

## Task 7: YouTube Sync 관리형 DB·Redis 전환

**Files:** `/Users/janguk/uk/youtube-sync/docker-compose.deploy.yml`, backend production config 및 media settings, deploy workflow.

- [ ] 관리형 MySQL에서 지정 runtime/migration 사용자를 생성한다. 기존 로컬 MySQL을 잘못 변경하지 않는다.
- [ ] TLS VERIFY_IDENTITY와 truststore를 유지하고 secret 값을 Vault 파일로 옮긴다.
- [ ] backend/media 각각 필요한 Redis ACL로 전환한다. 필요한 공유 키/채널을 실제 명령 사용처와 대조한다.
- [ ] MEDIA_TOKEN_SECRET은 양쪽을 조율해 전환하고 JWT access/refresh 변경에 따른 재로그인 영향을 고지한다.
- [ ] 백엔드/미디어 health 및 관련 API를 검증한다. 실제 재생·다중 브라우저 검증은 사용자 요청 없으면 미검증으로 남긴다.

## Task 8: 관리자 회전·옛 경로 폐기·최종 검증

**Files:** 서버 shared-infra Compose의 소스 관리 사본, runtime 운영 문서 및 검증 스크립트.

- [ ] 모든 앱 전환 확인 뒤 PostgreSQL/MySQL/MinIO/RabbitMQ 관리자를 교체한다. Redis default nopass를 종료한다.
- [ ] Grafana는 초기 env가 아니라 실제 사용자 변경 기능으로 계정을 변경하고 로그인 경로를 검증한다.
- [ ] 미사용 Conkiri 계정을 회수하되 업무 데이터·격리 증거는 삭제하지 않는다.
- [ ] 이전 계정으로 새 연결이 거부되는지 확인하고 필요한 기존 세션을 종료한다.
- [ ] CI Secret/서버 `.env`의 옛 값은 전환 검증 뒤 제거한다. 비밀 없는 host/port/Secret ID는 유지한다.
- [ ] 승인된 시간에 전체 재부팅을 검증한다. 그 전에는 재부팅 복구를 검증 완료로 보고하지 않는다.
- [ ] 사용자 요청에 따라 입력 파일을 보존하고 자동 삭제하지 않는다. 암호화되지 않은 로컬 사본 및 백업/편집기 이력의 잔존 위험을 알린다. 암호화 또는 비밀번호 관리자 전환은 별도 선택으로 제안하며 임의로 이전·삭제하지 않는다.
- [ ] 코드·클라우드 설정·실제 계정·배포·브라우저 검증 상태를 구분해 결과를 보고한다.

## 재개 조건

사용자가 입력을 마치고 재개를 요청하면 Task 1부터 진행한다. 이 파일의 체크박스는
계획이며 완료 증거가 아니다. 현재 계정/비밀번호/VM IAM/방화벽/배포는 변경하지 않았다.
