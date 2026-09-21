# 자격증명 입력 사전 검사 — 2026-09-21

## 후속 재개: 고정 schema 및 운영 계정명 검사

- `credential-input.mjs` 구현 및 합성 테스트8개 통과. 필수51개, 새 비밀번호19개, 유지할 기존 키15개를 별도로 검사한다.
- 실제 입력 파일: 전체51개 공급, 검사 오류0. 부모0700/파일0600·소유자·일반 파일·크기 제한·symlink 거부 포함.
- 새 비밀번호의 로컬 정책은12–32자리, 영문 대소문자·숫자·기호, 재사용 금지다. 실제 입력값19개는 기존에 생성한16자리 그대로이며 이번 작업에서는 수정하지 않았다.
- 계정명은 보수적인 ASCII 문자 정책과 제품별 길이 상한을 적용한다. 운영 서버의 전체 인증 정책이나 IAM 권한을 증명하는 검사는 아니다.
- 읽기 전용 운영 검사에서 PostgreSQL/local MySQL/Redis/RabbitMQ의 새 사용자명12개는 기존 사용자와 충돌하지 않았다.
- MinIO 관리자/앱2개, Grafana1개, 관리형 OCI MySQL2개는 미검증이다. 새 이름의 현재 사용 가능 여부는 계정 생성 권한·grant 적합성·복구 가능성을 보장하지 않는다.
- 입력 파일 보존 및 Git/Docker 제외 유지. 기존 계정·비밀번호·Vault/IAM·배포 설정은 변경하지 않았다.

## 최신 상태: 비밀번호 생성 및 파일 보관 요청 반영

아래의 최초 검사 결과 이후 사용자가 강력하되 너무 길지 않은 비밀번호 생성을 요청했다.
인프라/서비스의 `new_password` 및 `new_secret_key` **19개만** 서로 다른 16자리 값으로
교체했다. Node `crypto.randomInt`를 사용했으며 대문자·소문자·숫자·기호 포함,
기존 입력값/생성값과의 중복 없음, JSON 및 파일0600을 값 출력 없이 확인했다.
원본과 비교해 그 외 항목 및 서명/외부 키15개의 값은 그대로임을 검증했다.

최신 입력 파일의 YouTube backend/media Redis 사용자명은 서로 다르다.
사용자명은 이번 작업에서 변경하지 않았다. 최초 검사 때의 중복/길이/사용자명 문제는
해결됐으나, 고정 schema·대상별 전체 제약·기존 운영 계정 충돌·복구/배포 게이트 검증은 아직 별도다.

사용자의 명시적 요청으로 **입력 파일은 삭제하지 않는다**. Vault 전환 뒤에도 자동 삭제하지 않는다.
Git/Docker 제외와 파일0600은 암호화가 아니므로 로컬 파일 접근 시 모든 값이 노출되는 위험은 남는다.
이는 Secret Manager만을 장기 보관소로 삼는 보안 기본 원칙의 사용자 요청 예외이며,
원칙을 충족한 암호화 저장소라고 보고하지 않는다. 운영 서버/계정/Vault는 변경하지 않았다.

## 최초 검사 기록 (아래 문제는 위 최신 상태 참조)

사용자가 입력 완료 후 재개를 요청해 로컬 입력 파일만 읽기 전용으로 검사했다.
비밀값·값의 해시·실제 계정명은 이 기록이나 도구 출력에 포함하지 않았다.
사용자 값을 임의 생성/수정하거나 운영에 적용하지 않았다.

## 확인된 사항

- JSON 정상, 소유 사용자 파일, 일반 파일, 권한0600.
- `new_*` 51개 항목 모두 입력됨.
- 새 인프라/서비스 비밀번호·secret key는 19개 항목.
- 이전에 복사한 서명·외부 자격증명 15개는 이번 검사에서 회전 완료로 취급하지 않는다.

## 적용 전 수정 필요

### 새 비밀번호 중복

아래 각 묶음 안의 비밀번호가 동일하다. 관리자 및 서비스별 runtime/migration 분리 계획과 맞지 않는다.

- `infrastructure_admins`: PostgreSQL, local MySQL root, OCI MySQL admin, Redis, RabbitMQ, MinIO root, Grafana admin — 7개.
- `service_accounts`: Flight PostgreSQL runtime/migration — 2개.
- `service_accounts`: Ilchul MySQL runtime/migration, Redis, MinIO secret key — 4개.
- `service_accounts`: YouTube MySQL runtime/migration, backend Redis, media Redis — 4개.

### 8자 미만 값 7개

- `service_accounts.project_management_postgres_runtime.new_password`
- `service_accounts.flight_postgres_runtime.new_password`
- `service_accounts.flight_postgres_migration.new_password`
- `service_accounts.ilchul_mysql_runtime.new_password`
- `service_accounts.ilchul_mysql_migration.new_password`
- `service_accounts.ilchul_redis.new_password`
- `service_accounts.ilchul_minio.new_secret_key`

8자는 모든 제품에 공통으로 확인한 서버 정책이라는 뜻이 아니다. 특히 MinIO의 secret key는
최소8자가 필요하므로 해당 값은 적용할 수 없다.
[MinIO 공식 소스](https://github.com/minio/minio/blob/master/internal/config/errors.go).
나머지도 운영 자격증명으로 더 강한 값을 지정해야 한다. 사용자 지정값을 자동 보정하지 않는다.

### 같은 Redis의 사용자명 충돌

`service_accounts.youtube_backend_redis.new_username`과
`service_accounts.youtube_media_redis.new_username`이 동일하다.
두 역할을 별도 ACL 사용자로 나누려면 서로 다른 이름이 필요하다.
이는 입력값끼리의 비교이며, 기존 운영 계정 존재 여부 검사는 아직 수행하지 않았다.

## 중단 경계

입력 사전 검사에서 수정이 필요한 항목을 발견해 `poooling-security-principles`의
최소 권한/충돌 시 중단 절차에 따라 실제 적용을 보류했다.
서버 접속·운영 계정/비밀번호 변경·Vault/IAM 생성·배포·재시작·DB 백업/복원은 이번 재개에서 수행하지 않았다.
고정 schema 검증기·전체 대상별 제약·운영 계정 충돌·복구 및 배포 게이트 검사도 아직 미완료다.

사용자가 새 인프라/서비스 자격증명을 수정하고 재개를 요청하면 재검사한다.
117번째 줄 아래의 기존 서명/외부 키는 앞선 기존값 유지 요청을 별도로 존중하되,
추후 노출 정황이 확인된 값은 기존값 유지와 사고 대응을 다시 조율한다.
