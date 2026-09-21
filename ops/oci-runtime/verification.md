# 로컬 검증 기록 — 2026-09-21

## 최종 운영 상태 — 실제 PM Vault 전환 완료

- `3638acfda5c576b929460ffc4f6aa054d0d3eb04` main 배포 Actions35558744815 성공(7분19초).
  실제 `PM_MIGRATION_SUCCEEDED`, 컨테이너 경계 검증, 공개 로그인200/보호 페이지307 확인.
- 앱/호스트 release 모두3638acf. 실제 앱은 `PM_SECRET_DIRECTORY`를 사용하고 runtime 전용
  readonly mount만 받는다. Docker env 및 서버 `.env`에서 DATABASE_URL/SESSION_SECRET/
  APP_PASSWORD_HASH 제거 확인. inline Prisma 없음, migration 파일/lock 정리 확인.
- 앱 내부 reader/DB 클라이언트로 새 계정 접속·업무 테이블 읽기·비관리자·DDL 금지·migration
  이력 쓰기 금지를 확인했다. 기존 컨테이너 UID0 실행은 유지되며 non-root 전환은 아니다.
- 03:57:55UTC 기존 PM 소유자 역할은 NOLOGIN/PASSWORD NULL로 전환했다. 다른 컨테이너 소비0,
  기존 연결0, 다른 DB 의존0을 확인했고 소유 역할/업무 데이터는 보존했다. 실제 기존 비밀번호
  로그인 거부 및 새 runtime 로그인 성공. 보호된 roles-only 백업:
  `/var/backups/oci-vault-migration/pm-roles-before-retire-20260921T035755066Z.sql`.
- 기존 로그인 폐기 후 동일3638acf 이미지로 전체 host migration을 다시 실행해 성공했다.
  새 보호 백업→Vault migration Secret→Prisma→일회성 파일/컨테이너 정리 경로를 재검증했다.
- 최종 OCI 재조회에서 기존 VM 한 대만 매칭, manifest의 Secret4개만 read,
  서버 `/32`/VCN 우회 없음/services=none 및 모든 IAM 리소스 ACTIVE를 확인했다.
- 실제 Vault IAM 출발지를 잠시 불일치로 바꿔 Secret reload 실패를 확인했다. 이전 tmpfs 세대,
  동일 앱 컨테이너 및 publisher/runtime active가 모두 유지됐다. finally에서 원래 서버 `/32`,
  services=none을 복구했고 실제 Secret reload/readiness 재성공 확인.
- 로컬 SSH wrapper는15439의 개인 전용 터널로 새 Vault runtime 계정 연결/DDL 금지를 확인했고
  종료했다. 로컬에 운영 DB 값을 저장하지 않았다.
- 집중 테스트7개 중6PASS/Linux전용1skip, 타입 검사 및 DB 비밀값 없는 build PASS.
  사용자 입력 파일은 Git 제외·0600 상태로 보존한다. 다른 프로젝트 전환은 시작하지 않았다.
- 최종 전체 로컬 테스트371개:365PASS/6skip/실패0. 운영 검사는15개 모두PASS,
  변경 문서3개에 입력 파일의 비밀값/URL 인코딩 값 일치0개. 최종 결과 커밋은 문서만
  변경하므로 `[skip ci]`로 중복 배포하지 않는다. 실행 앱/호스트 코드는3638acf다.
- 전체 VM 재부팅, 브라우저 로그인 조작, 모든 업무 쓰기 흐름은 미검증이다. 이전 OCI token이
  모두 만료됐다고 주장하지 않으며 외부 출발지 제한과 단일 VM 신뢰 경계를 구분한다.

아래 준비/보류 문구는 이전 시점의 이력이다. 현재 상태는 위 최종 운영 상태가 우선한다.

## 실제 Vault 전환 재개 — 2026-09-21

- 사용자 완료 범위 재확인으로 PM 실제 전환을 재개했다. 다른 서비스 전환은 진행하지 않는다.
- VM 한 대의 기존 dynamic group, PM Secret4개의 개별 ID, 서버 public egress `/32`
  Network Source를 모두 요구하는 읽기 전용 IAM policy를 적용했다. Secret/키/IAM 관리 권한 없음.
- 실제 VM으로 합성 canary 조회 성공 후 Network Source를 TEST-NET 주소로 바꾸자404 거부됨을
  확인했다. 서버 주소를 복구하고 policy를 실제 PM4개로 변경했다. Network Source 최종
  `services=["none"]`, VCN 우회 없음. CLI update 생략 시 services=all 복귀 동작도 확인/수정했다.
- `project-management-secrets.service` 실제 시작 성공(active). 앱은 아직 기존 계정으로 실행 중이다.
- 기존 PM DB 계정은 컨테이너 설정상 PM만 소비하고 다른 DB 소유0개, migration7개 완료/미완료0개를
  읽기 전용 확인했다. 이후 실제 앱 전환, host migration, 기존 로그인 폐기는 별도로 검증한다.
- 잔여 OCI token 만료를 증명했다는 의미가 아니다. 외부 출발지 차단으로 보완하며 같은 호스트의
  root/탈취 신원 재사용 한계는 유지한다. source IP 변경 시 운영자가 재검증해야 한다.

## 최신 상태: PM 신원 경계 운영 적용 / Vault 전환 준비

- Secret dependency를 재시작하면 기존 앱이 migration 전에 멈출 수 있는 경로를 제거했다. start+ExecReload로 교체하고 회귀 테스트 RED→GREEN 확인. 서버의 격리된 systemd publisher/consumer fixture에서 reload 실패 후 두 서비스 모두 active 유지 확인, fixture unit/파일은 제거했다. 실제 Vault 서비스는 여전히 inactive/disabled이며 운영 Vault reload를 실행한 것은 아니다.

- 보호된 원본 full dump를2CPU/5GiB/네트워크 격리 DB에 실제 복원해 성공했다(540초). 테이블28개/완료 migration7개/pgvector0.8.1 확인. 테스트 컨테이너·볼륨·복사용 파일 제거, 운영 DB 미변경·원본 백업 보존 확인. 이전1CPU/600초 시험의 미완료 기록은 아래 이력이며 현재 복원 검증 결과는 PASS다. 이 복원은 no-owner/no-privileges 옵션의 데이터·스키마 검증으로, 운영 역할/ACL의 재난복구까지 검증한 것은 아니다.

- `a80bb68` main push/Actions35554715888 성공 및 호스트 staging 완료. Vault mode는 여전히 비활성이다.
- 계정 생성 오류의 PL/pgSQL 문맥 및 샘플링 로그를 추가로 제한했다. 격리된 실제 PostgreSQL에서 세션 설정 회귀 RED→GREEN과 기존 CRUD/DDL/기본 권한/SCRAM 검증을 다시 통과했다. 운영 전역 로그 설정이나 이미 만든 계정의 값은 변경하지 않았다. 테스트 자원 제거 확인.

- `84f070a` Actions35553417694 및 `49af918` Actions35553684284 모두 성공. 실제 `49af918` 컨테이너 running, broker mode, Secret file mode 아직 false, migration env 없음, restart=no, mount2개, 네 host unit active 확인. symlink readiness 정상 호출 exit0/잘못된 호출 exit1을 호스트에서 확인했다.
- root0600 manifest2개(부모0700) 및 Secret unit 설치 완료. runtime3개/migration1개 Secret ID가 서로 겹치지 않고 migration GID0임을 실제 manifest reader로 확인했다. 서비스 inactive/disabled, 전환 marker 없음, Vault IAM 미추가 상태다. 운영자 재조회로 Secret4개 version1/CURRENT/값 일치 및 기존ID 유지 확인(새로 생성0).
- 최신 회귀 Node66개 중65통과/Linux전용1skip, 타입 검사/비밀값 없는 build 통과. 실제 `49af918` 이미지에서도 core dump 비활성화 migration args로 격리 Prisma7개 적용 및 재실행 성공.
- Vault Compose의 core dump 제한은 합성 서비스 create/inspect로 실제 Docker `Name=core,Soft=0,Hard=0` 확인했다. 테스트 컨테이너 제거. 운영 PG의 sampled-duration/transaction-sampling 로그 비활성 및 pgaudit preload 없음도 읽기 전용 확인했다.
- 원본 full dump의 첫 격리 복원 시험(1CPU/5GiB, restore600초)은 인덱스 생성 도중 restore 단계에서 완료되지 않았다. 임시 컨테이너/볼륨/파일은 제거했고 운영 DB·원본 백업은 보존했다. 오류 종류를 분류하도록 검사기를 보완해2CPU/1200초로 재검증한다. **복원 성공은 아직 확인 전**이다.
- 02:18:38UTC PM 역할2개 생성/커밋 및 두 자격증명으로 실제 접속 검증 완료. runtime의 public schema DDL 거부 및 migration DDL 허용 확인. 기존 앱 자격증명은 변경하지 않았다. 생성 전 roles-only 보호 백업: `/var/backups/oci-vault-migration/pm-roles-before-20260921T021838998Z.sql`. 이전 full dump도 보존한다.
- 실제 `84f070a` ARM64 이미지로 네트워크 격리 DB에서 Prisma migration7개 적용 및 같은 job 재실행 통과. production builder와 동일한 migration args(읽기 전용 rootfs, cap-drop, no-new-privileges, 파일 Secret)에서 네트워크와 mount source만 격리 fixture로 교체했다. DB는 `project_management_test`, 실제 운영 DB 연결 없음. 소유한 테스트 컨테이너/볼륨/메모리 파일 제거 확인. `check-migration-container.mjs`로 명시적 재검증 가능하다.

- `84f070a` 준비 코드 main push 및 호스트 staging 후, 실제 `--check` 호출에서 `/current` symlink CLI의 main 판별이 실행을 건너뛰는 결함을 확인했다. 따라서 이 호출은 DB 조회/계정 생성 없이 끝났다. 공통 realpath 기반 main 판별과 실제 symlink 회귀 테스트로 수정하며 기존 identity readiness 진입점에도 적용한다. root 경계/방화벽/실제 토큰 및 storage 검증 결과와 CLI 시작 검사 실행 여부는 구분한다.

- host migration/배포 연결 준비: root marker 기반 mode 유지, 별도 migration mount, app secret env 제거, migration 실패 시 기존 앱 stop/up 없음, Vault systemd drop-in 구현. 서버 Compose 실제 파서7검사 통과. 마지막 파일의 개별 `!reset`이 값을 제거하지 않는 동작을 발견해 환경변수 map 전체 `!override`로 검증했다.
- 이번 집중 Node44개(43통과/Linux전용1skip), Python 준비4개/IMDS3개, 타입 검사 및 비밀값 없는 production build 통과. 실제 Vault mode 운영 배포/Prisma one-off 실행은 아직 미실시다. 신규 root manifest/marker를 설치하지 않았고 VM Vault IAM도 추가하지 않았다.

- 이전 운영 릴리스 `0c28f0d`: 빌드 오류 수정 `bb56087` Actions35551121405 및 후속 `0c28f0d` Actions35551459218 모두 성공했다. 실제 이미지/실행 상태, broker/file-token, WIF mount 없음, restart=no, systemd active를 재확인했다. 아래 두 실패 기록은 해결된 이력이다.
- `/opt/project-management-runtime/current`도 `0c28f0d`로 갱신했다. IPv4+IPv6 guard를 적용하고 systemd unit에 AF_INET6을 반영했다. 새 dual-stack Docker bridge에서 IMDSv1/v2 네 요청 전부 차단됐으며 IPv6 DROP packet counter 증가로 규칙 동작을 확인했다. probe 컨테이너/네트워크는 제거했다. 동일 systemd sandbox 설정의 check도 통과했다.
- PM Secret4개(version1/CURRENT)를 실제 Vault에 등록하고 운영자 SDK로 값 일치를 확인했다: runtime DB URL, migration DB URL, 유지하는 legacy session/bootstrap hash. **새 DB 계정 생성은 위 후속 기록대로 완료했으나 VM Vault IAM/앱 Secret mount/기존 계정 폐기는 아직 미적용**이다. manifest에는 비밀 아닌 ID/version만 기록했다.
- 별도 합성 canary Secret1개로 실제 OCI 암호화/Node SDK bundle 조회를 확인했다. 새 compartment에는 이 작업의 Secret5개가 있다. 이 canary는 앱 계정 비밀번호가 아니다.
- PM PostgreSQL 읽기 전용 감사: 현재 계정이 DB 및 public schema 소유 권한 보유, table28개/index56개 전부 해당 계정 소유. migration7개 완료/미완료0, pgvector0.8.1. 데이터/실제 사용자명은 출력하지 않았다.
- 수정된 SSH 래퍼로 포트15439의 전용 터널을 열어 DB 연결을 확인했고 소유한 터널은 종료했다.
- 사용자 추가 승인: host 전용 migration 작업으로 main 자동 배포 유지. migration Secret 읽기는 호스트의 고정 작업에만 추가하고 앱에는 주입하지 않는다. 관련 전환 코드/분리 테스트 구현 중이며 운영 적용 전이다.
- PostgreSQL grant core를 운영과 네트워크/데이터가 분리된 일회성 DB에서 검증했다. DB guard 대상은 localhost:5432/project_management_test. SCRAM 인증/오류 비밀번호, runtime CRUD 성공·DDL/다른 schema/role 전환/migration 이력 쓰기/sequence setval 거부, migration ALTER/future default grant, 기존 앱 계정 유지 및 중복 생성 거부 통과. 일회성 DB 컨테이너/볼륨과 코드 디렉터리는 제거했다. 운영 DB 통합 테스트는 실행하지 않았다.

- 준비 코드 `eae1ffa` 및 IPv6 unit 보정 `ae7d570`는 main에 push했으나 Actions35550798324/35550858154는 이미지 빌드에서 실패했다. 운영 앱 교체 전 실패이며 운영 이미지는 이전 성공 릴리스로 유지했다.
- 원인: AI HTTP 모듈의 eager createPool이 빌드 중 DATABASE_URL을 요구했다. 로컬 `.env`가 앞선 로컬 빌드에서 이를 가렸다. HTTP pool만 실제 DB 접근까지 지연 초기화하고 CLI의 엄격한 설정 검사는 유지했다. 누락된 설정으로 pg 기본 계정을 선택하지 않는다.
- 회귀 테스트 RED→GREEN 및 `DATABASE_URL='' PM_SECRET_DIRECTORY=/nonexistent-build-secret-mount pnpm build` 통과. 후속 집중 테스트62개(61통과/Linux전용1skip), 타입 검사 통과. 수정 후 Actions 성공 여부는 별도 확인해야 한다.
- `0997df5` main push와 Actions35549067826 성공. PM이 broker 및 Google 파일 토큰을 사용하고 WIF mount가 없음을 실제 컨테이너에서 확인했다.
- app IMDSv1/v2 차단, 호스트 IMDSv2 HTTP200, 새 Docker bridge의 IMDSv1/v2 차단 확인. 임시 probe 컨테이너/네트워크 제거. 전체 Docker 재시작·VM 재부팅은 미실시.
- 배포된 실제 앱 코드로 OCI 객체 PUT/GET/무결성/DELETE 및 Google1536차원 임베딩 성공. 테스트 객체는 제거했고 기존 업무 객체는 건드리지 않았다.
- 컨테이너 restart policy=no, systemd runtime active/running, guard active/exited, Google token timer 활성 확인. 이후 재배포 검증은 다음 코드 릴리스에서 다시 수행한다.
- 새 `service-runtime-secrets` compartment / DEFAULT Vault / AES256 SOFTWARE key 생성·ACTIVE/ENABLED 확인. 식별자만 `vault-resources.json`에 기록했다. Virtual Private Vault/HSM key는 만들지 않았다. Secret 값 등록 및 VM Secret-read IAM grant는 아직 없다.
- 새 KMS endpoint는 로컬 DNS에서 조회되지 않았다. VM DNS 결과와 정상 TLS 검증으로 도달 가능함을 확인하고 OCI CLI 한 프로세스에서만 주소 해석을 지정해 key 생성·ENABLED를 확인했다. 전역 DNS/hosts/인증서 검증을 변경하지 않았다.
- Vault 전달기: 고정 PM manifest/Secret ID/version, CURRENT stage/만료/삭제 예약 검사, 부분 전환 방지, tmpfs+swap 검사, root 소유 경로, 0640파일/0750서비스 디렉터리. 앱 reader는 완전한 한 세트를 고정하며 교체 시 프로세스 재시작이 필요하다.
- 로컬 집중 테스트61개 중60통과, Linux-root/tmpfs 전용1개 skip. 서버 실제 `/run`에서는 합성 데이터로 해당 검사 포함3개 통과. systemd Secret unit 문법 검증 통과. 테스트 디렉터리는 제거했다. 실제 Vault 조회 성공으로 보고하지 않는다.
- `pnpm typecheck`, `pnpm build` 통과. Python IMDS guard3개 통과. 새 단위 테스트는 먼저 실패를 확인한 뒤 구현했다.
- PM DB/세션/AI 수집기/운영 CLI에 파일 reader를 준비했다. 운영 `PM_SECRET_DIRECTORY`는 아직 활성화하지 않았고 DB 비밀번호도 바꾸지 않았다. 별도 migration credential/일회성 migration 실행 및 Compose/시작 게이트의 Vault 전환은 남아 있다.
- 로컬 SSH 래퍼는 기존 고정 사용자명 대신 SSH로 읽은 앱 자격증명의 실제 사용자와 DB를 검증하며 superuser/createdb/createrole/replication/bypassrls 계정을 거부한다. 현재 PM 계정이 이 제한을 통과함을 읽기 전용으로 확인했다.
- 공식 OCI Python SDK의 IPv6 IMDS 주소를 추가 확인했다. 호스트에 현재 해당 IPv6 route는 없지만 raw IPv6 규칙은 지원한다. IPv6 차단 코드는 추가했으며 호스트 적용·실패 여부는 별도 배포 검증으로 기록한다.
- VM Vault grant는 보류한다: 기존 leaf certificate 만료02:43:11UTC(11:43:11KST), 관측 token수명20분만으로 모든 과거 token 만료를 증명할 수 없다. 인증서 만료만으로 안전한 재권한 부여 시각이라고 단정하지 않는다.
- Flight/YouTube/Ilchul 자격증명 전환은 아직 시작하지 않았다. Ilchul 마지막·사용자 공동 전환 및 공유 계정 보존 경계를 유지한다. 사용자 입력 파일은 수정/삭제하지 않았다.

아래는 시간순 이전 기록이며, 현재 상태와 다른 항목은 위 최신 기록이 우선한다.

## 순차 운영 전환 준비 (사용자 승인 후)

- 사용자가 PM/Flight/YouTube Sync main push 및 순차 작업을 승인했다. Ilchul은 마지막에 함께 전환하며 자동 push/전환하지 않는다.
- origin/main을 fetch해 작업 기준점과 동일함을 확인했다.
- Grafana 새 계정명도 비충돌 확인: 전체13개 확인, MinIO2개/OCI MySQL2개는 미검증.
- MinIO 현재 컨테이너 관리자 환경을 사용한 사용자 목록 조회는 `SignatureDoesNotMatch`로 실패. 값 출력/비밀번호 변경 없이 보류했다.
- PM 운영 문서의 프로젝트/slug64쌍에서 broker 식별자 제약과 충돌하는 항목0개 확인. 본문/업무 데이터는 출력하지 않았다.
- `/opt/node24`가 없음을 확인하고 공식 Node24.21.0 Linux ARM64 배포본을 설치했다. 배포자 서명과 고정 SHA-256을 모두 검증했다. 기존 앱/컨테이너 Node나 인증 경로는 변경하지 않았다.
- 준비 코드 `4cc09d6`, 시작 게이트 `8f331a5`, 전환 스크립트 `3c8eddd`를 main에 push했다. 첫 두 Actions 배포 성공 확인. 이 배포들은 기존 앱 인증 경로를 유지했다.
- `/opt/project-management-runtime/releases/3c8eddd2a96e5c4725cb0ea573ad025a88b22d27`에 호스트 코드를 준비했다. pm-runtime GID987, broker 및 Google token timer 활성, 단기 토큰 권한0640/디렉터리0750 확인.
- 실제 OCI 테스트 객체 PUT/GET/무결성/DELETE 전부 통과. 테스트 객체는 삭제했으며 기존 업무 객체는 변경하지 않았다.
- PM DB 백업 `/var/backups/oci-vault-migration/pm-20260921T003525353826Z.dump`: 808183887bytes, 보호된 디렉터리0700/파일0600, pg_restore 목록 확인. 복원 시험은 미실시.
- runtime/IMDS guard unit은 서버 `systemd-analyze verify` 통과. 로컬 readiness3개, 방화벽3개, 준비 스크립트2개, immutable image 검사1개 추가 검증.
- 인증서와 token 만료는 별개다. 00:51UTC 조회의 instance leaf certificate 만료02:43:11UTC, 발급한 OCI token의 관측 수명1200초. 이 관측만으로 모든 과거 token의 최대 수명을 증명하지 않으며, 차단 뒤 잔여 신원 만료 검증 없이 Vault 권한을 추가하지 않는다.

## 후속 재개: 입력 검증 및 읽기 전용 서버 검사

- 집중 테스트39/39 통과(기존31 + 입력 검증8), 실패/skip0. 검증기 미구현 시 실패한 뒤 구현·통과를 확인했다.
- `pnpm typecheck`, `pnpm build`, `git diff --check`를 후속 재개에서도 다시 실행해 모두 exit0 확인.
- 실제 입력 schema51필드 통과, 새 비밀번호19개/기존 유지 키15개 구분. 파일은 수정·삭제하지 않았다.
- 서버 Compose5.1.3으로 병합4검사 통과: base+boundary, base+WIF+boundary, GID 누락 거부, boundary 뒤 WIF를 넣은 잘못된 순서 탐지. 원문 env/config 출력·서버 파일 저장·배포 없음.
- PostgreSQL/local MySQL/Redis/RabbitMQ의 새 계정명12개는 기존 계정과 비충돌. MinIO2/Grafana1/OCI MySQL2는 미검증. grant/관리 접근/백업·복구 검증 완료를 뜻하지 않는다.
- 서버 `/run`은 tmpfs, swap 비활성. 호스트 native Node와 pm-runtime 그룹 없음. 기존 WIF timer 활성, 새 broker/google-token unit 비활성.
- PM/Flight/Ilchul/YouTube backend/media는 실행 중. Ilchul/YouTube backend/media Docker health는 healthy, PM/Flight는 healthcheck 미설정. HTTP 및 업무 API 검증을 대체하지 않는다.
- PM은 여전히 WIF mount 사용, broker/token-file 경계 미적용. VM Vault 조회 권한을 추가하지 않았다.
- main 통합/커밋/push/배포/재시작/계정 변경/Vault 생성은 하지 않았다. 아래 초기 기록의 미검증 항목 중 Compose와 입력 검증은 이 후속 기록으로 갱신한다.

브랜치: `security/oci-vault-migration-20260920`.
main/HEAD 기준점: `2ee35e81870ca004370ba331e16e9ac90ba2955b`.
사용자 지시에 따라 인라인 구현/검토했고 서브에이전트·독립 리뷰·커밋·push는 수행하지 않았다.

## PASS

- 집중 테스트 **31/31**, 실패/skip 0. 실행 명령은 README의 로컬 검증 절과 동일하다.
- `pnpm typecheck`: exit0.
- `pnpm build`: exit0, Next production compilation 및 static generation 성공.
- `git diff --check`: exit0.
- 입력 경로 `.private/oci-vault-credentials.json`은 `git check-ignore`로 제외됨을 확인했다.
  `git ls-files .private`는 비어 있다. 파일 내용은 읽지 않았다.
- `.dockerignore`의 `.private`와 `.superpowers` 제외를 유지한다.
- main과 HEAD는 기준점 그대로다. 변경은 현재 폴더의 작업 브랜치 미커밋 작업 트리에 남겼다.
- 새 운영 Secret/장기 API 키/개인키/공개 포트를 만들지 않았다. 합성 fixture token은 테스트 전용이다.

## 검사 범위

- Google 파일 인증: 매 요청 atomic 교체 반영, 만료, 누락, JSON 오류, 파일 크기 제한,
  symlink/디렉터리/쓰기 권한 거부, 비밀 없는 오류, 실제 Google SDK 헤더 계약.
- Chirp: 실제 기본 인증 경로의 token 주입, 404/412 처리 유지, 제출 자동 재시도 방지.
- Unix broker: 실제 socket을 통한 조건부 PUT/GET/DELETE, 한글 식별자, scope/경로/추가 필드 거부,
  바이트 수·SHA 검증, 변조/잘린 응답 거부, redirect 거부, 지연 요청·동시 요청 제한.
- Host runtime: 보호된 socket 생성/정리, 기존 파일 보존, 실제 설치 OCI SDK의 요청별 abort signal,
  redirect 금지, 단일 시도. 외부 fetch만 합성 응답으로 교체했다.
- Host publisher: 파일 권한0640, atomic 교체 중 유효 JSON 유지, 잘못된 provider 응답/만료 거부,
  갱신 실패 시 기존 파일 보존, symlink 및 쓰기 가능한 부모 디렉터리 거부.
- 기존 자료 참조/무결성/보상 삭제와 녹음/임베딩 회귀 테스트 포함.

새 테스트를 먼저 실행해 구현 부재를 확인한 뒤 구현했다. 추가 OCI SDK 경계 검사에서
upstream 오류가 SDK 내부 경고로 출력되는 문제를 재현하고 실패 테스트를 만든 뒤,
오류 본문을 SDK 전 단계에서 폐기하는 수정으로 통과시켰다. 인증 SDK 내부 로그는
host unit의 stdout/stderr 미저장으로 별도 제한한다.

## NOT VERIFIED / NOT APPLIED

- Docker Compose 실제 병합: 이 컴퓨터에 Docker CLI 없음. `!override`는 Compose2.24.4+ 필요.
- Linux systemd 검증, Node24/그룹 설치, 호스트 tmpfs 권한 및 실제 OCI/Google 갱신.
- 운영 앱·자료 API·임베딩의 새 경계 동작, IMDS 차단/영속화, 기존 단기 신원 만료.
- 부팅 순서, Docker 재시작/전체 재부팅, Actions 변경 후 정상 재배포 유지.
- 전체 DB 연동 테스트/공유 DB 쓰기/브라우저 검증은 실행하지 않았다.
- 계정 생성·비밀번호 변경·Vault 생성/Secret 등록/IAM 권한 부여를 하지 않았다.
- Flight/Ilchul/YouTube Sync 파일 인증 전환은 이 PM 로컬 구현 단위에 포함하지 않았다.

## 후속 경계

이 결과는 **PM 인증 분리용 로컬 준비**이지 운영 해킹 위험 해소나 Vault 이전 완료가 아니다.
운영 경계 적용에는 main 통합/배포, 호스트 설치, IMDS 차단과 정상 기능 검증이 남는다.
그 전에 Vault 조회 권한을 부여하지 않는다. 자격증명 입력값 검증·소비 및 실계정/Vault
변경은 아직 시작하지 않았다. 후속 절차는 README와 전체 Vault rollout 계획을 따른다.

## 후속 사용자 요청 — 기존 서명/외부 자격증명 입력

위의 "입력 파일을 읽지 않음"은 로컬 구현 완료 시점 기록이다. 이후 사용자의 명시적
요청으로 입력 파일 117번째 줄 아래 `application_signing_secrets` 6개와
`external_reissuance` 9개의 빈 필드에 현재 실행 중인 해당 서비스의 기존 값을 복사했다.
Flight Google OAuth는 설정 JSON의 `web.client_secret`만 추출했고,
YouTube backend/media의 공유 키 일치를 확인했다. 앞부분 및 나머지 필드는 변경하지 않았다.
파일0600·Git 제외 유지 및 저장값 일치를 값 출력 없이 확인했다. 임시 가져오기 스크립트는 제거했다.

필드 이름이 `new_secret`/`new_password`여도 이 15개는 **기존 값 재사용**이며 신규 발급이나
회전이 아니다. 운영 설정·계정·비밀번호·Vault는 변경하지 않았다. 향후 적용 과정에서
이를 교체 완료로 취급하거나, 노출 의심 자격증명을 안전해졌다고 판정하면 안 된다.
# Flight / YouTube Sync follow-on cutover (2026-09-21, in progress)

- Flight host publisher and migration profiles are separate; migration mount is root-group only. Fixed `flight-db` backup precedes host-only Alembic.
- Isolated PostgreSQL fixture: runtime CRUD, migration DDL and future-object grants PASS; runtime DDL, migration-history writes, SET ROLE, sequence setval and temporary DDL denied. Fixture/container/network removed; no production role changes at this checkpoint.
- Common host tests: 38 PASS / 1 Linux-only SKIP; PM typecheck/build PASS. Existing PM cutover is not changed by the added inactive Flight units.
- Flight secret reader tests 4 PASS; backend suite 91 PASS / 1 FAIL. The same guest-submission 422-vs-201 test fails on unchanged HEAD in an isolated source extraction; recorded as pre-existing, not silently fixed in this security cutover.
- Flight deployment failure fixtures PASS: publisher reload or migration failure does not stop the existing app or run compose up. Whole environment injection and app-startup migration are removed in the pending Flight release.
- YouTube OCI MySQL administrator reset is NOT authorized: user chose to provide the existing password in ignored, mode-0600 `.private/youtube-mysql-current-admin.json`. Existing new-credential input remains unchanged.
