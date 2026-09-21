# PM 호스트 인증 경계 및 Vault 전환

PM broker/token publisher 및 IMDS 차단 경계는 `0997df5`로 운영 적용했다.
운영 검증은 `verification.md`의 최신 기록을 따른다. **Vault IAM·DB 계정·비밀번호 전환은 아직 별도다.**
사용자 입력 파일은 보존한다. 일반 Vault/SOFTWARE key와 PM Secret4개 및 새 PM DB 역할2개를 생성했다. 앱 DB 계정 전환 및 VM 조회 권한은 아직 적용하지 않았다.

## Vault 전달기 준비 상태

- `vault-resources.json`은 실제 생성한 리소스의 비밀 아닌 ID만 가진다. `vault-manifest.example.json`은 예제이지 실제 설치 manifest가 아니다.
- 운영자만 `/etc/oci-service-secrets/project-management.json`을 root:root0600, 부모 root:root0700으로 설치한다. 서비스/파일명/Secret ID/버전을 고정하며 앱의 임의 경로나 요청을 받지 않는다.
- runtime/migration manifest2개와 `project-management-secrets.service`는 호스트에 보호된 권한으로 준비했으나 서비스는 inactive/disabled이며 전환 marker도 없다. 활성화 전 VM 잔여 신원 안전 게이트와 Secret별 최소 조회 IAM을 확인한다. 2026-09-21 사용자 승인으로 host 전용 migration 작업에는 migration Secret 조회를 허용하되, 일반 앱 mount 및 infra admin Secret은 제외한다.
- host CLI는 `/run/oci-service-secrets/project-management`에 완전한 세대를 만든다. `/run` tmpfs와 swap 비활성을 강제하고 파일0640/디렉터리0750을 사용한다. 부분 실패 시 기존 세대는 그대로 두고 실패한다.
- 앱에는 서비스 디렉터리만 읽기 전용으로 mount하고 `PM_SECRET_DIRECTORY` 경로만 전달한다. 앱은 한 세대를 고정하므로 값 교체에는 명시적인 프로세스 재시작이 필요하다. 변수 존재 시 파일 실패를 env fallback으로 숨기지 않는다.
- 아직 운영 Compose에 Secret mount를 켜지 않았다. `docker-compose.vault.yml`은 앱 command를 `node server.js`로 바꿔 inline migration을 없애며, 비밀 환경변수 전체를 제거한다. 호스트 root0600 `/etc/project-management-vault.enabled`의 정확한 `enabled` 한 줄로 전환한 뒤에만 배포 스크립트가 이 override와 host migration을 선택한다. 잘못된 marker는 legacy fallback 없이 배포를 중단한다.
- Vault 배포는 Secret 동기화/시작 검사 → 보호된 DB 백업 → 별도 migration 성공 → 기존 앱 교체 순서다. `prepare-cutover.py`는 Vault mode를 재배포 때 보존하고 서버 `.env`의 DB/session/bootstrap 값을 제거한다(보호된 최초 백업 보존). systemd drop-in이 Secret 서비스 및 tmpfs 준비 검사를 요구한다. **marker 생성/서비스 활성화/실제 host migration 성공 검증은 별도 전환 게이트다.**
- Secret 조회 성공/재부팅 시 시작 순서는 아직 실검증하지 않았다. 일반 배포는 현재 DB env 방식을 유지한다. 이전 세대 폐기는 모든 소비자의 전환을 확인한 뒤 별도로 한다.

### 운영자 PM Secret 등록

`node ops/oci-runtime/register-pm-secrets.mjs --check`는 보호된 입력 파일과 SSH로 읽은 현재 PM 설정을 메모리에서 대조한다.
`--apply`는 기존 개인 OCI CLI identity로 runtime/migration DB URL과 유지할 legacy session/bootstrap hash를 Vault에 등록한다.
값은 stdin/SDK 메모리 경로만 사용하며 출력/인수/추가 영구 파일에는 남기지 않는다. 기존 Secret이 있으면 version1/CURRENT/값 일치를 검사하고 다르면 중단한다. 자동 덮어쓰기/버전 변경은 없다.
이 작업은 DB 계정을 생성하거나 VM IAM을 부여하지 않는다. 부분 실패 후에는 기존 Secret 목록을 확인하고 같은 명령으로 일치 여부를 검증한다. 실제 등록된 ID/version은 `vault-manifest.project-management*.json`에 기록했다(값 없음).
별도의 `migration-delivery-canary`에는 합성 fixture만 저장했다. 실제 운영자 인증으로 새 key/Vault/Node SDK bundle 조회가 성공했으며 앱 자격증명이나 VM 권한 검증을 대신하지 않는다.

### PM PostgreSQL 및 host migration 준비

- `apply-pm-roles.mjs --check`는 개인 SSH 설정/strict known-host로 새 값 두 세트만 stdin에 전달한다. 호스트 `provision-pm-roles.mjs`가 현재 DB·admin·소유자·계정 충돌을 읽기 전용 검사한다.
- `--apply`는 보호된 roles-only 백업 후 하나의 PostgreSQL transaction에서 새 runtime/migration 계정을 생성한다. 기존 계정의 값은 덮어쓰지 않는다. runtime은 public CRUD와 sequence USAGE/SELECT, migration 이력은 SELECT만 가능하다. public CREATE를 제거하고, migration 계정은 기존 PM 소유자 역할을 상속한다. cluster superuser/CREATEDB/CREATEROLE/replication/BYPASSRLS는 두 계정 모두 없다.
- 신규/기존 소유자의 future table/sequence default grants도 설정한다. 기존 PM 소유 역할은 나중에 NOLOGIN 전환하며 DB/테이블 소유권 보존용으로 유지할 수 있다. 일반 앱에서 이 역할을 상속하지 않는다.
- host migration마다 현재 PM DB의 custom-format 백업과 archive 목록 검증을 선행한다. 디스크 여유4GiB 미만이면 중단하며 백업을 자동 삭제하지 않는다. 이 백업은 실제 restore rehearsal을 대신하지 않는다. 스키마 변경은 기존 앱과 호환되는 expand/contract 방식이어야 하며 실패했다고 DB를 자동 downgrade하지 않는다.
- `node ops/oci-runtime/check-migration-container.mjs project-management:<검증할 SHA>`는 서버의 기존 이미지와 일회성 네트워크 격리 PostgreSQL을 사용한다. 운영 Secret 없이 합성 파일로 실제 Prisma7개 migration 및 재실행/읽기 전용 rootfs를 검증하고 소유한 테스트 자원을 정리한다. 운영 DB/restore rehearsal/Vault IAM 통합 검증을 대체하지 않는다.
- 호스트 migration/파일 readiness 및 Vault 앱·일회성 컨테이너에는 core dump를 비활성화한다. SDK/Prisma 상세 출력도 외부 로그로 전달하지 않는다.
- `check-pg-role-permissions.mjs project-management:<SHA>`는 별도 격리 DB에서 계정 분리의 실제 SQL/SCRAM/권한 경계를 검증한다. 계정 생성 세션은 오류 문맥·샘플링 로그도 제한하며 pgaudit 설치 또는 preload가 있으면 비밀값을 DB에 보내기 전에 중단한다. 이 설정은 해당 연결에만 적용하고 서버 전역 로그 정책은 바꾸지 않는다.
- 값은 PG bind parameter로 전달한다. utility DDL의 식별자/값은 서버 format의 `%I`/`%L`로 처리하고 작업 세션의 statement/parameter 로그를 끈다. pgaudit가 설치된 경우 임의 우회하지 않고 중단한다. 결과/예외에서 SQL·비밀번호를 출력하지 않는다.
- core grant 로직은 네트워크/포트/데이터가 운영 DB와 분리된 일회성 PostgreSQL에서 `localhost:5432/project_management_test` guard를 통과시켜 검증했다. 실제 SCRAM 로그인/틀린 비밀번호 거부, runtime CRUD, DDL/타 schema/role 전환/migration 이력 쓰기/sequence setval 거부, migration ALTER 및 future default grant를 확인했다. 이후 실제 PM 역할2개도 보호 백업 후 생성하고 각 로그인/권한을 읽기 전용 검증했다. 기존 앱 계정은 유지한다.
- `migrate-pm.mjs`는 호스트의 고정 작업이다. migration profile만 별도로 읽고 read-only/cap-drop/no-new-privileges/비밀값 로그 미보관의 일회성 컨테이너로 Prisma를 실행한다. 종료 확인 뒤 migration tmpfs를 정리한다. 배포 경로 연결과 격리 이미지 실행은 검증했으나, 실제 VM Vault 조회/전체 host job 실행 및 실패 복구 검증 전에는 운영에 활성화하지 않는다.

## 재실행 가능한 사전 검사

```sh
node ops/oci-runtime/credential-input.mjs
node ops/oci-runtime/check-compose-boundary.mjs
node ops/oci-runtime/check-account-collisions.mjs
python3 /Users/janguk/.codex/skills/oci-ssh/scripts/oci_ssh.py --script < ops/oci-runtime/identity-readonly-preflight.sh
```

- 입력 검증: 고정51필드, 보호된 파일, 새 비밀번호19개와 기존 유지 키15개를 구분한다. 비밀값/실제 사용자명은 출력하지 않는다. 오류 시 exit1.
- Compose 검사: 로컬 소스3개만 SSH로 전달해 서버의 익명 메모리 파일에서 파싱한다. 운영 `.env`를 읽거나 Compose를 적용하지 않는다. 올바른 두 병합, GID 누락 거부, 잘못된 override 순서 탐지까지 검사한다.
- 계정 검사: 현재 PostgreSQL/local MySQL/Redis/RabbitMQ 사용자 목록을 메모리로 읽고 입력값과 대조한다. 원문/사용자명은 출력하지 않는다. 미지원/조회 실패는 `NOT_VERIFIED`(exit2), 충돌은 exit1이다. MinIO/Grafana/관리형 MySQL은 별도 확인해야 한다. `AVAILABLE`은 조회 시점의 비충돌이며 생성 승인이나 권한 검증이 아니다.
- 서버 상태 검사: Docker inspect 전체를 출력하지 않고 앱 실행 상태, WIF mount/broker/token-file 여부와 호스트 준비 여부만 반환한다.

## 경계와 남는 위험

- 앱 → `/run/project-management-broker/storage.sock`: 지정 버킷의 `materials`(16MiB), `recordings`(100MiB) 객체 GET/조건부 PUT/DELETE만 처리한다. 목록·임의 URL·버킷·서명·Vault 조회 기능은 없다.
- 호스트의 OCI Instance Principal과 Google WIF는 호스트에 남는다. 앱에는 `/run/project-management-google/access-token.json`의 단기 Google bearer token만 전달한다.
- 사용자별 문서 접근 권한은 계속 앱의 DB 세션/프로젝트 정책이 담당한다. 중계는 PM의 프로젝트 사이를 별도 IAM으로 격리하지 않는다. 침해된 PM 앱은 알려진 PM 객체와 해당 Google 서비스 계정 권한을 토큰 유효기간 동안 사용할 수 있다.
- 동일 VM root·Docker 관리자·특권 모니터링은 공통 신뢰 영역이다. root 침해 보호/VM별 IAM 분리를 구현한 것이 아니다.
- 응답 전체를 크기·SHA-256 검사한 후 전달한다. 최대 네 요청을 처리하며, 시간 초과된 OCI 호출이 실제로 끝나기 전에는 슬롯을 반환하지 않는다. 취소 신호를 SDK HTTP 계층에 전달하지만 인증 갱신 자체가 멎으면 슬롯이 남을 수 있다. 실패 시 무제한 작업을 시작하지 않고 가용성을 제한한다.
- 토큰 재발행 실패 시 마지막 파일을 유지한다. 앱은 남은 유효기간 30초 미만이면 실패하며 ADC로 돌아가지 않는다. 무기한 캐시/장기 키가 아니다.
- OCI SDK에 전달하기 전에 실패 응답 본문을 버리고 고정 오류로 바꾼다. 인증 갱신 SDK의 내부 로그까지 통제하기 위해 두 host unit의 stdout/stderr를 journal에 저장하지 않는다. 상태/종료 코드와 socket·파일 만료 상태로 감시한다. 장애 분석 시 SDK debug 로그를 무심코 켜지 않는다. 앱/중계 요청 내용은 로깅하지 않는다.

## 호스트 경계 설치 절차 (현재 설치 기록은 verification.md 참조)

1. PM 코드와 호스트 코드를 검토해 main 기준의 동일 릴리스로 만든다. 이미지 digest와 Git SHA를 기록한다. 자동 배포를 먼저 전환하지 않는다.
2. 호스트의 `/run` tmpfs, swap 비활성/보호 상태, 디스크·메모리 여유, 기존 `project-management-wif.service/.timer`를 확인한다. 호스트 런타임은 조사 당시 없었으므로 **Node 24 Linux ARM64**를 공식 배포본의 서명/체크섬으로 검증한 뒤 `/opt/node24/bin/node`에 설치해야 한다. curl-to-shell이나 검증 없는 실행 파일 복사는 금지한다.
3. root 소유 `/opt/project-management-runtime/releases/<git-sha>`에 검증된 코드와 **pnpm-lock.yaml로 고정한 Linux용 의존성**을 배치하고 root 소유 `current`를 그 릴리스로 연결한다. macOS `node_modules` 복사 금지. 최소 코드: `ops/oci-runtime/*.mjs`, `lib/server/object-storage-broker-protocol.mjs`; OCI/Google 의존성 트리도 필요하다. `.env`, `.private`, 개인 키/설정, 작업 트리 전체를 복사하지 않는다. 코드/런타임/모든 상위 경로는 root 소유이며 그룹·일반 사용자 쓰기 불가여야 한다. 설치 시점의 기존 경로/파일은 덮어쓰기 전에 확인한다.
4. `getent group pm-runtime` 및 후보 GID 사용처를 검사한다. 이름/GID 충돌이 없을 때만 운영자가 전용 시스템 그룹을 생성한다. 실제 GID를 비밀 아닌 `PM_RUNTIME_GID`로 설정한다. 앱의 `group_add`에는 이 GID만 추가한다. Docker/admin 그룹을 추가하지 않는다. 런타임 디렉터리 0750 root:pm-runtime, socket0660, token0640이다. 그룹은 디렉터리에 쓸 수 없다. 현재 root 앱의 근본적인 호스트 신뢰 위험이 사라지지는 않는다.
5. `/etc/project-management-object-broker.conf`(root:root0600)에 **비밀 아닌** 세 변수 `OCI_STORAGE_REGION`, `OCI_STORAGE_NAMESPACE`, `OCI_STORAGE_BUCKET`만 작성한다. 프로세스가 값을 출력하지 않도록 한다. host broker는 이미 있는 PM 버킷 권한만 사용한다. Secret 권한/새 장기 키를 추가하지 않는다.
6. 제공된 service/timer를 `/etc/systemd/system`에 설치하기 전에 `systemd-analyze verify`로 대상 OS에서 검증한다. `ExecStart`, root 소유 경로, 그룹, `/run` 권한을 확인한 뒤 daemon-reload한다. 기존 WIF timer는 유지한다. broker와 google-token service의 **첫 성공을 확인한 후** Google timer를 enable한다. 토큰 내용/인증서/환경 전체를 출력하지 않는다.
7. 설치 중에는 기존 앱의 인증 경로를 유지한다. 새 socket/token 파일을 호스트에서 형식·권한·만료 여부만 확인한다. 원문이나 hash를 출력하지 않는다. 비정상 파일/기존 socket을 발견하면 자동 삭제하지 않는다. 해당 프로세스/소유자를 먼저 조사한다.

## Compose 및 부팅 순서

`docker-compose.identity-boundary.yml`은 마지막 override다. `volumes: !override`로 기존 WIF 마운트 목록을 **대체**한다. Docker Compose **2.24.4 이상**이 필요하다 ([공식 병합 규칙](https://docs.docker.com/reference/compose-file/merge/)). 이 태그를 일반 리스트로 바꾸면 이전 개인키 마운트가 남을 수 있다.

로컬 병합 검증은 실제 비밀 없이 다음과 같이 한다. `config` 원문 대신 `--quiet`를 사용하고 추가 검사는 결과 JSON을 메모리에서 파싱해 마운트 경로·인증 방식만 출력한다. `.env`를 읽지 않도록 `/dev/null`을 지정한다.

```sh
DATABASE_URL=postgresql://fixture:fixture@127.0.0.1/fixture APP_PASSWORD_HASH=fixture SESSION_SECRET=fixture DB_NETWORK_NAME=fixture PM_RUNTIME_GID=9999 \
docker compose --env-file /dev/null -f docker-compose.yml -f docker-compose.wif.yml -f docker-compose.identity-boundary.yml config --quiet
```

실제 전환은 host 준비 후 app만 재생성한다. 운영 `config`/`docker inspect` 전체 출력에는 기존 DB 비밀이 포함되므로 금지한다. JSON 검사에서는 `Mounts.Source/Destination`, broker mode, token **경로만** 허용한다.

기존 `project-management-runtime.service`는 WIF 준비 뒤 `docker start`만 수행한다. **그대로 두면 부팅 순서 보장이 부족하다.** 운영 전환 시 이 서비스의 drop-in으로 broker 및 google-token service에 `Requires`/`After`를 추가하고, 컨테이너 시작 전 socket 존재·유효한 token 파일을 값 출력 없이 검사하는 단계를 넣어야 한다. Docker의 `unless-stopped` 자동 복구도 이 순서를 우회할 수 있으므로 부팅 게이트와 함께 검증한다. 앱 파일이 없으면 인증은 실패하지만 앱의 다른 기능이 기동할 수 있다. 전체 앱이 시작하지 않는다고 주장하지 않는다.

Compose의 read-only **디렉터리** mount를 사용한다. 파일 한 개를 bind하면 atomic rename 뒤 이전 inode를 계속 읽을 수 있다. broker 재시작 시 systemd가 runtime 디렉터리를 제거/재생성하면 기존 bind가 오래된 디렉터리를 참조할 수 있으므로 `RuntimeDirectoryPreserve=yes`를 사용하고, 최종 중단/재부팅 경로도 시험한다.

Actions는 host readiness를 먼저 검사하고 `scripts/deploy-identity-boundary.sh`로 전환한다.
스크립트는 전체 Compose 결과를 메모리에서 검사하고 기존 `.env`/runtime unit의 보호된 백업을 남긴다.
`.env`의 비밀값은 이 단계에서 유지하며, 비밀 아닌 `COMPOSE_FILE`과 `PM_RUNTIME_GID`만 고정해 수동 Compose도 같은 override를 사용하게 한다.
Docker restart policy는 `no`로 바꾸고 systemd가 socket/token/방화벽 검사 후 시작·복구한다.
소스 반영만으로 완료라고 하지 않고, 실제 Actions 배포와 이후 재배포에서 확인해야 한다.

## IMDS 차단 및 Vault 권한 부여 전 게이트

1. 현재 자료·녹음 참조의 프로젝트/slug 식별자만 검사한다. `/`, `\\`, `%`, 제어 문자 또는 점 경로를 쓰는 기존 식별자가 있으면 임의로 참조를 바꾸지 말고 호환성 방안을 결정한다.
2. broker/socket/token 파일 인증으로 자료 다운로드 SHA-256 일치와 승인된 테스트 객체의 조건부 업로드·삭제, Google 임베딩을 검증한다. 기존 DB/삭제 outbox/hash 계약을 유지한다.
3. PM 컨테이너의 WIF/OCI 개인키/기타 ADC mount가 사라졌는지 확인한다. 환경·토큰 원문은 출력하지 않는다.
4. 호스트 방화벽에서 **앱 컨테이너 → `169.254.169.254:80`** 차단을 적용한다. 호스트 WIF/Instance Principal 갱신은 허용해야 한다. 공유 bridge 전체 차단은 같은 네트워크의 소비자를 먼저 확인한다. `169.254.0.0/16` 전체 차단으로 DNS/NTP 등 OCI 기능을 깨뜨리지 않는다. host-network/privileged 컨테이너는 별도 예외 위험이다.
5. bridge 재생성·Docker 재시작 후 다시 적용되는 root 소유의 소스 관리 규칙/서비스를 준비하고 실제 패킷 차단을 검증한다. OCI NSG 규칙만으로 컨테이너의 link-local 메타데이터 접근이 차단됐다고 단정하지 않는다.
6. 차단 후 IMDSv1/v2가 모두 실패하고, 호스트 토큰 갱신은 성공해야 한다. HTTP200만이 아니라 접근 실패 원인을 구분하고 응답 본문은 저장하지 않는다.
7. 기존에 발급된 OCI 세션/Google 토큰의 만료와 IAM 정책 전파 시간을 확인한다. mount 제거·IMDS 차단은 이미 탈취된 자격증명을 즉시 무효화하지 않는다. 노출이 의심되는 신원은 별도 대응 없이는 신뢰하지 않는다.
8. 위 경계가 운영에서 확인되기 **전에는 VM에 Vault Secret 조회 권한을 추가하지 않는다.**

방화벽은 `raw PREROUTING`에서 목적지 `169.254.169.254:80` 및 `[fd00:c1::a9fe:a9fe]:80` TCP만 차단한다.
IPv6 주소는 [공식 OCI SDK](https://github.com/oracle/oci-python-sdk/blob/master/src/oci/auth/signers/instance_principals_security_token_signer.py)의 endpoint와 일치시킨다.
호스트가 직접 보내는 OUTPUT 요청과 DNS/NTP는 이 규칙의 대상이 아니다. bridge 이름이나 Docker filter 체인에 의존하지 않는다.
`project-management-imds-guard.service`는 Docker보다 먼저 실행되도록 설정하며, PM runtime unit은 방화벽·broker·token 준비를 요구한다.
host-network/특권 컨테이너 및 호스트 root는 여전히 공통 신뢰 영역이다. 전체 재부팅은 별도 승인 후 검증한다.

## 녹음 worker

현재 없는 worker를 이 변경으로 시작하지 않는다. Speech/GCS 권한·DB migration·유료 작업은 별도 승인 단계다. 향후 활성화할 때 `docker-compose.recordings.yml`의 worker에도 broker mode, token file env, GID, WIF를 **대체하는** 두 디렉터리 mount를 적용한 별도 override가 필요하다. 현재 app-only boundary override는 worker를 보호하지 않는다. 해당 override 없이 두 구성을 함께 활성화하지 않는다.

## 장애·롤백

- 잘못된 파일/권한/만료, host unit 실패, 자료 hash 불일치, Google 실패, Compose 버전/마운트 미확인 시 전환 중단. 새 계정·Secret 등록도 진행하지 않는다.
- refresh 실패 시 기존 단기 토큰의 유효기간까지만 동작한다. 새 파일이 유효하면 앱이 다음 요청부터 읽는다. 만료된 토큰 또는 ADC/env로 조용히 돌아가지 않는다.
- 이 A 단계는 DB 계정/스키마를 바꾸지 않는다. 앱 코드의 이전 검증 이미지로 롤백할 수 있지만 그 이미지가 broker/file-auth를 지원하는지 먼저 확인한다.
- Vault 권한을 추가한 뒤 WIF mount/IMDS를 앱에 복구하면 모든 허용 Secret이 위험해진다. **광범위 신원 접근을 되살리는 자동 롤백은 금지**한다. 롤백으로 필요한 권한 회수/전파/만료 확인을 별도 수행한다.
- 재부팅은 승인된 시간에만 검증한다. 테스트 전에는 재부팅 복구 완료라고 보고하지 않는다.

## 로컬 검증

```sh
node --experimental-strip-types --test lib/server/google-runtime-auth.test.mjs lib/server/object-storage-broker.test.mjs lib/server/material-storage.test.mjs lib/server/chirp-transcription.test.mjs lib/ai-ops/search/provider.test.mjs ops/oci-runtime/*.test.mjs
pnpm typecheck
pnpm build
git diff --check
```

집중 테스트는 합성 토큰·임시 Unix socket·가짜 외부 SDK 응답만 사용한다. 실제 입력 파일/공유 DB/OCI/Google 호출은 없다.
별도 사전 검사에서는 실제 입력 파일과 운영 사용자 목록을 읽었다. Compose 병합7개는 서버 Compose5.1.3으로 검증했다.
호스트 인증 경계와 정상 재배포는 검증했다. Vault 실제 전환·전체 host migration·재부팅 검증은 별도이며 최신 운영 증거는 `verification.md`를 따른다.
