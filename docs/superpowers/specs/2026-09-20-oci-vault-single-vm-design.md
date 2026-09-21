# OCI 단일 VM 자격증명 전환 설계 및 1차 실측

작성: 2026-09-20. 상태: 읽기 전용 조사 완료 범위 기록 / 구현 전 검토.

## 1. 승인된 방향과 경계

- 사용자는 단일 OCI VM을 유지하고 호스트 root 침해 시 공통 피해 위험을 수용했다.
- 일반 앱은 OCI 인스턴스 신원을 갖지 않고 자신의 비밀값만 받는다.
- 현재 운영 인프라 자격증명은 침해 여부와 무관하게 순차 교체한다.
- 외부 API 제공자에서만 재발급할 수 있는 키는 권한 확인 후 별도 교체한다.
- VocaTest는 정지를 유지한다. Conkiri 사고 증거와 기존 업무 데이터는 삭제하지 않는다.
- 유료 Vault 종류, 추가 VM, 새 장기 OCI API 키를 만들지 않는다.
- 비밀값을 대화, 명령 인수, 로그, 저장소, 새 영구 `.env`에 남기지 않는다.
- 정상 서비스의 짧은 순차 전환을 기본으로 하되, 전체 재부팅은 중단 시간을 조율한다.

이 구조는 OCI IAM의 서비스별 독립 신원이 아니다. 여러 Secret을 읽는 호스트 전달 계층은
공통 신뢰 영역이다. `security-principles` §9 및 `infrastructure-design-manual` §14의
서비스별 IAM 분리에 대한 단일 VM 과도기 예외를 사용자가 선택한 것으로 기록한다.
계정별 DB 권한과 앱의 파일 접근권한은 분리하되, 호스트 root 보호를 보장한다고 표현하지 않는다.

## 2. 1차 실측 결과

2026-09-20 13:21–13:30 UTC 서버 및 OCI 조회. 값 대신 이름·권한·설정 경로만 출력했다.
이 문서는 미래 운영 상태를 보증하지 않으며, 전환 직전에 상태를 다시 확인한다.

| 대상 | 확인한 현재 상태 | 전환 영향 |
| --- | --- | --- |
| Flight PostgreSQL | `flightapp`이 실제 접속 중이며 superuser / CREATEDB / CREATEROLE / replication / BYPASSRLS 권한 보유 | 앱 사용자 신설, migration 권한 분리 필요 |
| PM PostgreSQL | `project_management_app`, 해당 DB 소유자, superuser 아님 | Prisma 기동 migration과 일반 앱의 권한 분리 필요 |
| Ilchul MySQL | `ilchul_user`가 `ilchul_db` 사용, `ilchul_db`와 `ilchuldb`에 DDL 포함 광범위 권한 | Flyway 별도 주체 및 실제 사용 schema 한정 |
| 로컬 MySQL | `root@%`, `root@localhost`, `conkiri@%`, `youtube_sync@%` 존재 | 이름만 보고 삭제하지 않고 실제 소비자 확인 후 폐기 |
| YouTube Sync MySQL | 파일 설정의 URL이 OCI 관리형 MySQL private endpoint를 가리킴 | 로컬 MySQL 계정 교체로 해결되지 않음. 관리형 DB grants/관리 접근 별도 조사 |
| Redis | `default` 사용자 하나, `on nopass`, 명령 `+@all`, 키 `~*`, 채널 `&*` | 서비스별 ACL 및 코드 인증 설정 도입 후 default 종료 |
| RabbitMQ | `admin` administrator, 기본 vhost 전체 권한, 조회 시점 연결 0 | 장기간 사용 여부 확인 후 관리자 교체·불필요 접근 제한 |
| MinIO | 관리자 비밀번호가 Ilchul·Flight·중지 Conkiri의 환경설정에 재사용 | Ilchul 전용 정책/계정, 관리자 교체. admin API 권한 목록은 미검증 |
| Flight 파일 저장 | 실제 컨테이너에 `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` 없음, 로컬 저장 경로 사용 | MinIO로 새로 이전하지 않음. 불필요한 root 비밀번호 전달 제거 |
| PM OCI 인증 | `shared-infra` 네트워크, Instance Principal 직접 사용, WIF 디렉터리 읽기 전용 마운트 | OCI 키 전달과 IMDS 접근을 모두 제거 |
| PM 전사 worker | 코드/Compose에는 존재, 이번 `docker ps -a`에서는 실행 컨테이너 없음 | 코드 호환성 검증과 실제 전사 가동 확인을 구분 |
| 메타데이터 방화벽 | 특정 bridge 이름 6개에 대한 FORWARD TCP/80 차단 | PM/shared-infra 및 새 bridge를 포함한 지속성 설계 필요 |
| 런타임 메모리 저장 | `/run`은 tmpfs, 활성 swap 없음 | 서비스별 디렉터리·권한·부팅 순서 구성 가능 |
| Vault | 춘천 리전 root/Administrator/dev 조회에서 없음 | 일반 Vault/소프트웨어 보호 키로 신규 구성 검토 |
| VM IAM | PM 버킷의 object read/create/overwrite/delete 정책 확인 | Vault 권한 추가는 앱 신원 차단 검증 뒤 |
| 백업 | PM 과거 dump와 보안 백업 존재. 확인한 timer/crontab에서 운영 DB 자동 백업 작업 미발견 | 백업 부재 확정 아님. 적용 전 새 검증 백업과 실제 복구 경로 필수 |

동일 값 재사용은 비교를 메모리에서 수행하고 그룹 구성원 이름만 출력했다.
환경변수의 존재·동일 값과 실제 사용 여부는 구분했다. 예: Flight의 MinIO root 값은
전달되지만 현 코드가 읽는 이름과 다르다. YouTube의 DB 설정은 마운트 파일이 우선한다.

### 호스트급 권한을 가진 모니터링

- cAdvisor: privileged, 호스트 `/`, `/var/lib/docker`, `/var/run` 읽기 마운트.
- Beyla: privileged.
- Promtail: Docker 소켓 쓰기 접근.
- node-exporter: 호스트 루트 읽기 마운트(실행 사용자는 nobody).

이들을 일반 앱과 동등한 격리 대상으로 간주하지 않는다. 같은 monitoring 네트워크에
Flight/Ilchul 백엔드도 붙어 있으므로 접근 가능한 관리 endpoint와 네트워크 경계를 검토한다.
특히 Docker 소켓은 단순 로그 파일이 아니며, 읽기 전용 bind만으로 Docker API의
변경 동작이 금지되는 것으로 판단하지 않는다. 모니터링 제거/교체는 임의로 하지 않는다.

## 3. 하위 작업 A — PM의 OCI 신원 분리

### A1. Object Storage 중계

호스트의 PM 전용 Unix 소켓으로 저장소 IO만 제공한다. 앱에는 OCI 토큰·인스턴스 개인키를
반환하지 않는다. 중계 프로세스의 버킷/namespace/region은 호스트 관리 설정으로 고정한다.

- 허용 동작: 고정된 자료·녹음 경로의 GET/PUT/DELETE.
- 금지 동작: 임의 URL 프록시, 임의 버킷, 범용 요청 서명, Secret 조회.
- 경로는 scope/project/slug/SHA-256 구조로 검증하고 이중 인코딩·경로 이탈을 거부한다.
- 크기 제한은 기존 material 16MiB / recording 100MiB 계약을 보존한다.
- PUT의 `ifNoneMatch` 및 실패 정리 의미를 유지한다.
- 기존 앱의 사용자 권한, 참조 검증, 크기·hash 검증, 삭제 outbox는 유지한다.
- 소켓 접근권한, 요청 timeout, body 상한, 동시성 상한, 오류 응답의 비밀값 제거를 테스트한다.
- 호스트 root 또는 중계 프로세스 침해에 대한 별도 보장을 하지 않는다.

주요 변경: `lib/server/object-storage.mjs`, 새 중계 client/test, 새 `ops/oci-runtime/`
호스트 서비스와 설치/검증 스크립트, `docker-compose.yml`, 전사 override.

### A2. Google WIF

호스트가 OCI 신원으로 Google WIF 교환을 완료하고, 앱에는 기존 PM 전용 Google 주체의
단기 access token만 전달한다. OCI cert/key 및 Google refresh token/장기 키는 전달하지 않는다.
이 방식은 Google 권한 자체를 파일별로 축소하는 것은 아니므로 해당 Google 주체의 IAM도 검토한다.

- 토큰 파일: 서비스 전용 tmpfs 디렉터리에 atomic replace, 만료 시각 포함.
- 앱은 요청 시 갱신된 토큰을 읽으며 만료/형식 오류 시 인증 실패로 처리한다.
- `@google/genai`의 auth client와 `ChirpTranscription`의 Google 인증 경로를 함께 수정한다.
- 로컬 개발의 개인 ADC는 별도 경로로 유지한다.
- 기존 인증서 생성 디렉터리를 앱과 worker에서 unmount한다.
- 인스턴스 개인키를 없애는 것만으로 기존에 탈취된 단기 토큰이 즉시 무효화되지는 않는다.
  Vault 신규 권한 부여 전 이전 신원/토큰의 유효기간과 IAM 전파를 검토한다.

주요 변경: `lib/ai-ops/search/provider.mjs`, `lib/server/chirp-transcription.mjs`,
`ops/ai-search/`, `docker-compose.wif.yml`, `docker-compose.recordings.yml`.

### A3. 메타데이터 접근 차단

모든 비신뢰 앱 컨테이너에서 IMDS HTTP 접근을 차단하고 호스트의 신뢰 프로세스만 사용한다.
동일 주소의 OCI DNS/NTP 등 필요한 인스턴스 기능을 일괄 차단하지 않는다.

- 특정 bridge ID 목록에만 의존하지 않는다.
- host networking/privileged/NET_ADMIN/docker.sock 경로를 앱에 허용하지 않는다.
- Docker 재시작, 네트워크 재생성, 서버 재부팅 후 규칙이 복원되어야 한다.
- 앱→IMDS 실패, 호스트 인증 성공, 앱 파일 IO/AI 기능 성공을 별도로 증명한다.
- 새 Vault 권한은 A1–A3 검증이 끝나기 전 VM에 부여하지 않는다.

## 4. 하위 작업 B — Vault 전달 계층

운영자와 런타임 조회 주체를 분리한다. VM은 manifest에 고정된 Secret bundle 조회만 가능하게
정책을 작성하고 Secret 생성·변경·삭제 및 IAM 관리 권한은 부여하지 않는다.
앱이 Secret ID 또는 대상 디렉터리를 요청하는 범용 API는 만들지 않는다.

- 일반 Vault, 소프트웨어 보호 대칭 키. Virtual Private Vault는 사용하지 않는다.
- manifest에는 Secret ID/version, 서비스, 파일명, UID/GID만 넣는다.
- `/run/oci-app-secrets/<service>/`에 서비스별 파일 제공. 상위 전체 디렉터리는 앱에 마운트하지 않는다.
- 경로·symlink·파일 형식·ownership 검증, 파일 permission 제한, 로그에 값 없음.
- atomic generation 교체와 디렉터리 mount를 사용해 부분 갱신과 오래된 file inode 문제를 방지한다.
- 프로세스 기동/갱신 실패 시 기존 유효한 메모리 세대를 보존하되 폐기된 비밀값으로 자동 복구하지 않는다.
- 재부팅 후 Vault 불가용으로 비밀값을 준비하지 못하면 해당 앱은 실패 상태로 대기한다.
- 조회 실패를 숨기며 `.env`로 fallback하지 않는다.
- tmpfs라는 이유만으로 앱 실행 권한이나 호스트 root로부터 안전하다고 주장하지 않는다.

비용 근거: Oracle 공식 Always Free 문서상 software-protected key 무료,
테넌시 전체 Secret 150개 무료. 생성 직전 실제 사용량/선택 옵션을 다시 확인한다.

## 5. 하위 작업 C — 앱별 파일 주입 및 계정 회전

### PM

- DB URL을 파일에서 직접 읽는 경로를 Prisma/pg/CLI worker에 공통 적용한다.
- 기동 시 migration 전용 자격증명과 앱 런타임 자격증명을 분리한다.
- `scripts/with-shared-db.mjs`의 SSH 조회도 변경한다. 로컬 영구 복사 금지.
- AI ingestion/search/recordings worker를 누락하지 않는다.
- 현재 DB 기반 사용자 세션과 legacy `SESSION_SECRET` 서명 세션의 영향을 구분한다.
  사용자 비밀번호를 일괄 변경하지 않는다.

### Flight

- `backend/database.py`와 실제 외부 서비스 설정의 파일 읽기를 지원한다.
- PostgreSQL runtime user 신설, 현재 flight schema/sequence 접근만 허용한다.
- 앱 기동 DDL/마이그레이션 사용을 조사하고 관리자 계정 제거 전에 분리한다.
- 현재 로컬 파일 저장을 유지하며 불필요한 MinIO root 값은 주입하지 않는다.
- SMTP/Kakao/Google OAuth 설정과 DB에 보관된 사용자 OAuth 토큰은 다른 종류로 분류한다.
- `docker-compose.yml`, `.github/workflows/deploy.yml`의 `.env` 재생성 경로를 변경한다.

### Ilchul

- Spring configtree로 secret 파일 주입, Redis username/password 설정 추가.
- Flyway 계정과 일반 DB 사용자 분리. 적용된 migration은 수정하지 않는다.
- AWS SDK default environment credential chain 의존을 파일 기반 최소 권한 MinIO 인증으로 대체한다.
- `S3Client`와 `S3Presigner` 모두 변경한다.
- blue/green 두 Compose와 배포 스크립트가 같은 비밀값 주입 계약을 사용하게 한다.
- 로그아웃 영향이 있는 JWT 교체와 OAuth/API 키 교체를 구분해 검증한다.

### YouTube Sync

- 관리형 MySQL의 실제 runtime grants 및 관리 접근을 먼저 검증한다.
- TLS `VERIFY_IDENTITY`와 truststore 인증을 유지하며 기존 config 파일 비밀값을 Vault로 이전한다.
- backend와 media의 Redis 계정은 실제 사용하는 키/명령/채널 범위로 나눈다.
- 두 서비스의 `MEDIA_TOKEN_SECRET`은 계약에 맞춰 동시 전환한다.
- JWT access/refresh 교체에 따른 재로그인 영향을 기록한다.
- YouTube cookie 파일은 별도 민감 자산으로 관리하고 값 출력/강제 재발급을 하지 않는다.

### 공통 인프라 관리자

- MySQL/PostgreSQL/MinIO/RabbitMQ 관리자 비밀번호는 앱 의존 제거 후 교체한다.
- Redis default nopass는 모든 실제 소비자 전환 후 종료한다.
- 컨테이너 초기화용 환경변수 변경을 실제 저장된 계정의 비밀번호 교체로 착각하지 않는다.
- Grafana 초기 관리자 환경변수 역시 기존 계정 비밀번호 변경을 보장하지 않으므로 실제 계정 경로를 확인한다.
- 사용이 끝난 Conkiri 계정은 증거 보존과 별개로 폐기한다. 관련 데이터는 삭제하지 않는다.

## 6. 순서 및 복구

1. 노출 의심 계정의 즉시 회수 가능성을 평가한다. 사용처가 없는 계정은 백업/권한 검증 후 우선 회수한다.
2. 사용 중인 공통 계정은 소비자 전환 없이 비밀번호만 바꾸지 않는다.
3. PM 신원 분리와 IMDS 차단 검증 후에만 VM Vault 권한을 추가한다.
4. 첫 pilot은 PM의 비밀 파일 주입으로 한다. 신원 분리 작업과 동일 배포 계층을 재사용한다.
5. 이후 Flight superuser 제거, Ilchul MinIO/DB, YouTube 관리형 DB와 공유 Redis를 의존성 순서로 전환한다.
6. 계정 회전은 새 계정 → Vault → 앱 전환 → 실제 기능 확인 → 이전 계정 폐기 순서다.
7. 관리자 회전, 기존 CI Secret/서버 env 정리, 배포·재부팅 검증을 마친다.

전환 직전에 private backup을 만들고 형식/복구 절차를 확인한다. dump 파일 존재만으로
복원 테스트 통과라고 표현하지 않는다. 폐기한/침해 의심 자격증명을 롤백 시 재활성화하지 않는다.
앱 이미지/manifest/Secret version/실제 대상 계정 상태를 하나의 전환 기록으로 관리한다.

## 7. 통과 조건

- 단위/계약 테스트: 다른 서비스 Secret 접근 거부, 경로 이탈 거부, 만료 토큰 거부,
  secret 누락 시 fail-closed, 오류/로그에 secret 미포함.
- PM: 관련 테스트, typecheck, production build. 공유 DB 대상 테스트/reset 금지.
- 앱별 build/test 및 서비스에 맞는 API 검증. 브라우저 검증은 요청 없으면 수행하지 않는다.
- live: 새 계정 연결, 기존 계정 거부, DB/업로드/로그인/배치 기능 확인.
- 파일 저장 검증은 전용 검증 객체만 사용하며 업무 파일을 임의 변경하지 않는다.
- OCI API/Vault 장애, 재배포, Docker 재시작, 동의된 서버 재부팅을 구분해서 검증한다.
- root/특권 모니터링 침해까지 격리했다고 보고하지 않는다.
- 부분 성공을 전체 전환 완료라고 보고하지 않는다.

## 8. 아직 검증되지 않은 항목

- OCI Vault/IAM 생성 권한: read API 성공만으로 write 권한을 증명하지 않음.
- 관리형 MySQL의 실제 사용자 grants와 관리자 회전 경로.
- MinIO admin 사용자/정책 조회: 이번 read-only 호출 실패. 환경설정 재사용만 확인됨.
- DB 자동 백업의 모든 실행 경로 및 복구 시험.
- 외부 OAuth/API/SMTP 제공자별 재발급 관리 권한.
- 특권 모니터링 endpoint의 앱 네트워크 접근 경계.

## 참고

- https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/callingservicesfrominstances.htm
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.docker.com/compose/how-tos/use-secrets/
- 현재 P-Grid `security-principles`, `infrastructure-design-manual` 원문을 이번 조사 전에 읽음.
