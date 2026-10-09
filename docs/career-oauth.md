# 기존 OWNER 계정으로 ChatGPT·Hermes 연결

Better Auth / OAuth Provider **1.7.6**을 서버 내부에서 운영하는 구현이다. 카카오·Auth0 가입, 소셜 로그인, 새 비밀번호는 없다. 기존 일반 웹 ChatGPT 연결을 유지하며, 명시적으로 설정한 추가 public client만 허용한다. 운영 DB 적용·시크릿 등록·앱 배포·클라이언트 설정·실제 연결·플러그인 교체는 별도 단계이며, 실제 적용 상태는 아래 서버 준비 이력을 따른다.

## 인증 흐름

1. 등록된 앱이 PKCE S256, 클라이언트별 고정 client/callback/resource와 요청 scope를 보내면 서버가 5분짜리 연결 요청을 보관한다. 무작위 HttpOnly/Secure/SameSite=Lax 쿠키의 해시로 브라우저에 결합한다.
2. `/career/connect`에서 기존 소유자 계정으로 로그인하거나 현재 소유자 세션으로 계속한다. bootstrap·ADMIN·MEMBER는 불가하다. 기존 로그인 API의 비밀번호 검사·로그인 제한을 그대로 사용한다.
3. 소유자 확인 POST에서만 OAuth 내부 사용자/등록 client/resource를 준비한다. 사용자 비밀번호를 복사하지 않는다. 필수 이메일은 비전달용 `@owner.invalid` 내부 식별자이며 검증 완료나 실제 이메일로 취급하지 않는다.
4. `/career/consent`에 등록된 앱 이름과 실제 요청 권한을 표시한다. Better Auth의 서명 쿼리와 브라우저 결합 해시를 모두 확인하며 동의 요청은 일회용이다. 기존에 동의한 권한은 provider가 재사용할 수 있지만 새 연결은 항상 현재 PM 소유자 확인을 거친다.
5. 요청한 앱이 code/PKCE를 교환한다. 접근 토큰은 ES256 JWT, 최대 15분이다. `offline_access`가 있으면 회전하는 갱신 토큰으로 원래 연결 시점부터 최대 30일 동안 유지된다. MCP는 JWT 만료 외에 원래 grant 만료도 검사한다.

권한은 `career:read`, `career:evaluate`, `career:write`, `offline_access`이다. 모든 연결에 read가 필요하다. OAuth 동의와 Jev 외부 전송/비용 동의, 최종 문서 저장 동의는 별개다.

## 폐기와 저장 경계

- `access_user`가 신원 원본이다. 추가 `oauth_epoch`는 비밀번호·역할·활성 상태 변경 시 DB trigger로 증가한다. 연결 해제도 증가시키고 기존 동의를 제거한다.
- 기존 OWNER 행 잠금으로 발급/갱신/폐기를 직렬화한다. OAuth 세션은 생성 시 세대를 고정하므로 refresh로 새 세대에 승격되지 않는다. MCP는 매 요청, 후속 Jev 호출 전 및 잠긴 문서 저장 트랜잭션 안에서 현재 세대를 검사한다. 이미 전송된 외부 호출은 취소·환불할 수 없다.
- `/career/connection`의 연결 해제는 ChatGPT·Hermes 등 모든 클라이언트의 기존 접근·갱신 토큰을 모두 무효화한다. 일반 PM 웹 로그아웃은 OAuth 연결을 끊지 않으며, 어느 쪽도 저장된 취업 문서를 삭제하지 않는다.
- 표준 `/oauth2/revoke`는 refresh token을 폐기할 수 있지만 이미 발급한 JWT는 최대 15분 동안 남는다. provider는 JWT access token 자체의 revoke를 지원하지 않는다. 즉시 양쪽을 폐기하려면 소유자 화면의 연결 해제를 사용한다.
- `career_oauth_*` 테이블은 OAuth 상태 전용이다. refresh token은 provider의 해시 저장 기본값을 사용한다. 서명 private key는 `CAREER_OAUTH_SECRET`으로 암호화되며 JWKS에는 public key만 노출한다. 키 회전 30일, 이전 공개키 유지 유예 1일이다.
- 공개 endpoint는 정확한 경로/메서드만 허용한다. 공개 가입·client 등록·DCR/CIMD·userinfo·일반 Better Auth session API는 열지 않는다. 토큰 교환은 브라우저 쿠키를 무시하며, bridge/동의/연결 해제는 현재 PM 세션 및 정확한 Origin을 요구한다.
- metadata/JWKS/화면 GET은 계정·client·resource·서명키를 생성하지 않는다. authorize GET은 OAuth 프로토콜을 위한 일시 요청만 생성하며 만료된 일시 요청을 정리한다. 모든 응답은 no-store/no-referrer다.

## 배포 전 필요한 설정

| 설정 | 값 |
| --- | --- |
| CAREER_MCP_ENABLED | 활성화 시 `true` |
| CAREER_OAUTH_ENABLED | 자체 OAuth 활성화 시 `true` |
| CAREER_MCP_RESOURCE | `https://project.dev-uk.shop/mcp/career` |
| CAREER_MCP_OWNER_ID | 실제 활성 OWNER의 기존 DB ID |
| CAREER_MCP_CLIENT_ID | ChatGPT 연결에 등록할 고정 client ID |
| CAREER_OAUTH_REDIRECT_URI | ChatGPT에서 확인한 정확한 `https://chatgpt.com/connector/oauth/...` callback |
| CAREER_OAUTH_ADDITIONAL_CLIENTS | 선택적 `{clientId,name,redirectUri}` JSON 배열. 미설정 또는 `[]`이면 기존 ChatGPT만 허용 |
| CAREER_OAUTH_SECRET | 별도 무작위 32바이트 이상 서버 비밀; Vault runtime 파일 |
| OPENROUTER_API_KEY | 기존 Jev 키; Vault runtime 파일 |

자체 OAuth 모드에서 issuer/JWKS/subject는 resource origin과 OWNER ID로 결정한다. 과거 `CAREER_MCP_ISSUER`, `CAREER_MCP_JWKS_URL`, `CAREER_MCP_SUBJECT`를 남겼다면 파생값과 일치해야 한다. 다른 값은 fail-closed다.

- issuer: `https://project.dev-uk.shop/api/career-auth`
- discovery: `https://project.dev-uk.shop/.well-known/oauth-authorization-server/api/career-auth`
- authorize/token/JWKS: issuer 아래 `/oauth2/authorize`, `/oauth2/token`, `/jwks`
- client authentication: public client `none`, 필수 PKCE S256. client secret은 없다. ChatGPT의 실제 등록 UI가 이 설정을 수용하는지는 배포 후 확인한다.

운영 변경 순서 (각 단계 별도 승인):

1. 기존 DB와 migration 이력을 읽기 검사하고 검증된 백업을 확보한다.
2. `20260929160000_career_better_auth` forward migration을 기존 migration identity로 적용한다. **새 Prisma client 배포보다 먼저 적용**한다. 기존 계정에 열이 추가되므로 feature flag가 꺼져 있어도 이 순서는 필요하다. 운영 reset/db push/migrate dev는 사용하지 않는다.
3. OAuth 비밀과 기존 Jev 키를 Vault에 등록하고 runtime manifest의 정확한 secret/version 및 IAM 권한을 추가한다. 보호된 generation에 `CAREER_OAUTH_SECRET`, `OPENROUTER_API_KEY` 파일을 제공한다. 환경 변수나 배포 로그에 키를 출력하지 않는다. 2026-09-29 서버 준비에서 실제 두 secret의 version 1을 등록했고 manifest 및 별도 최소 권한 정책은 `ops/oci-runtime/vault-manifest.project-management.json`, `vault-access.career.json`에 기록했다.
4. 승인된 배포에 `docker-compose.career.yml`을 기존 Vault/identity/recordings override **뒤에** 추가한다. 이 파일은 비밀, 포트, 마운트를 추가하지 않으며 기본 비활성이다. Vault 배포의 마지막 overlay로 포함하는 소스 변경과 CI 업로드 변경은 아래 활성화 이력을 따른다.
5. HTTPS host/proxy, discovery, JWKS, 무인증 MCP의 401 challenge를 확인한다. ChatGPT 연결 설정의 client/callback을 정확히 맞춘다.
6. 실제 OWNER 로그인 → 동의 → MCP 목록/문서 읽기 → 별도 동의된 Jev 호출 → 새 대화에서 연결 재사용 → 연결 해제 후 거부를 확인한다. 그 후에 플러그인 교체/게시한다.

DB의 암호화된 키를 읽는 데 OAuth 비밀이 필요하므로 이 비밀을 임의로 교체하면 기존 키/세션이 동작하지 않는다. 회전·복구는 백업과 재연결을 포함한 별도 운영 작업으로 다룬다.

## Hermes 사전 등록과 격리 컨테이너 연결

2026-10-09 [Hermes 공식 MCP 문서](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)와 [설정 레퍼런스](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference/)를 확인했다. Hermes는 `oauth.client_id`로 사전 등록한 public client를 사용하고 PKCE 코드 교환·refresh를 수행할 수 있다. [공식 OAuth 소스](https://github.com/NousResearch/hermes-agent/blob/main/tools/mcp_oauth.py)의 `_maybe_preregister_client`, `_build_client_metadata`, `_resolve_redirect_uri`와 [provider 구성](https://github.com/NousResearch/hermes-agent/blob/main/tools/mcp_oauth_provider.py)의 `build_provider_kwargs`가 이 설정을 처리한다. 따라서 DCR·CIMD·장기 API 키를 추가하지 않는다. 설치된 Hermes 버전에 해당 옵션과 paste-back 지원이 있는지 연결 전에 확인한다.

다음 예시는 운영에 적용하지 않은 설정 안내다. 추가 DB migration은 필요하지 않으며 운영 환경 반영·앱 배포·실제 OWNER 로그인은 별도 작업이다.

1. 기존 ChatGPT ID·callback을 그대로 둔 채 PM 서버에 다음 **비밀이 아닌** JSON 설정을 전달한다. 컨테이너 환경에도 이 변수가 전달되어야 한다.

   ```dotenv
   CAREER_OAUTH_ADDITIONAL_CLIENTS=[{"clientId":"career-hermes","name":"Hermes","redirectUri":"http://127.0.0.1:27890/callback"}]
   ```

2. Hermes를 실행하는 동일 프로필의 `config.yaml`에 다음 서버를 추가한다. 실제 MCP 요청 URL과 PM의 resource 값은 정확히 같아야 한다. `client_secret`을 넣지 않는다. 평가는 별도 기능이므로 필요한 경우에만 `career:evaluate` scope를 추가한다.

   ```yaml
   mcp_servers:
     career:
       url: https://project.dev-uk.shop/mcp/career
       auth: oauth
       oauth:
         client_id: career-hermes
         client_name: Hermes
         token_endpoint_auth_method: none
         redirect_host: 127.0.0.1
         redirect_port: 27890
         scope: "career:read career:write offline_access"
         timeout: 300
   ```

3. 같은 컨테이너·같은 OS 사용자·같은 Hermes 프로필에서 대화형 터미널로 `hermes mcp login career`를 실행한다. 표시된 authorize URL을 개인 브라우저에서 열고 PM OWNER로 로그인·동의한다. 서버의 연결 요청은 5분, 발급 코드는 2분 동안만 유효하다.
4. 컨테이너에 포트를 공개하지 않은 환경에서는 브라우저의 `http://127.0.0.1:27890/callback?...` 접속 실패가 예상된다. 주소창의 전체 콜백 URL 또는 `?code=...&state=...` 부분을 **진행 중인 Hermes 터미널의 paste-back 프롬프트에만** 붙여 넣는다. Hermes가 받은 state를 확인하고 보관 중인 PKCE verifier로 교환한다. 이 일회용 URL을 채팅·문서·로그에 남기거나 다른 세션에서 사용하지 않는다. 컨테이너 포트 게시, 방화벽 개방, VM의 사설망 차단 해제는 필요하지 않다.
5. 토큰은 Hermes의 해당 프로필 저장소에만 유지한다. 문서상 기본 위치는 `~/.hermes/mcp-tokens/`, 파일 권한은 `0600`이다. 프로필/컨테이너를 바꾸면 캐시 위치도 달라질 수 있으므로 gateway와 로그인 프로세스가 같은 프로필을 써야 한다. 이후 gateway를 재시작하거나 세션에서 `/reload-mcp`로 갱신하고 읽기 호출을 검증한다. 쓰기는 명시적 요청과 requestId/revision 계약을 따른다.

완전한 비대화형 프로세스는 첫 동의를 대신할 수 없다. 만료·폐기로 refresh가 불가능하면 다시 명시적으로 로그인한다. 이 서버는 device grant도 제공하지 않으므로 `--flow device`는 사용하지 않는다. 선택한 `27890` 포트를 Hermes 내부에서 쓸 수 없으면 서버의 정확한 callback과 Hermes의 `redirect_port`를 함께 바꾼다. Desktop/dashboard의 callback 자동 대체나 임의 포트 선택을 사용하지 않는다.

추가 클라이언트 설정은 최대 8개이며 ID·정규화된 callback은 기존 ChatGPT 등록을 포함해 중복될 수 없다. 추가 callback은 정확한 HTTPS URL 또는 `http://127.0.0.1:<1024..65535>/callback`만 허용한다. wildcard, userinfo, query, fragment, localhost 별칭과 URL 정규화에 의존하는 표현은 거부한다. 잘못된 JSON·알 수 없는 필드·빈 문자열은 설정 전체를 fail-closed 처리한다. 미설정과 `[]`만 추가 클라이언트가 없는 상태다.

authorize·consent·code/refresh·revoke와 MCP JWT에서 등록 ID를 검사한다. `client_id`와 `azp`가 함께 있으면 같은 ID여야 한다. 클라이언트 ID와 다른 클라이언트의 callback/code/refresh를 섞을 수 없다. 설정에서 클라이언트를 제거하면 그 ID의 기존 access JWT·refresh·진행 중인 동의도 즉시 거부한다. DB의 provider 이력은 삭제하지 않으므로 같은 ID를 재등록하면 아직 유효한 grant를 다시 사용할 수 있다. 영구 폐기가 필요하면 제거 전에 연결 관리에서 epoch를 올려 **모든 앱**의 연결을 해제한다. callback만 바꾸는 것은 기존 토큰의 폐기를 의미하지 않는다.

이 단계는 서버·클라이언트의 설정 계약과 로컬 테스트를 제공한다. 실제 Hermes 버전, 브라우저 승인, 컨테이너 캐시 유지와 운영 MCP 실연결은 검증하지 않았다.

## 서버 준비 이력 — 2026-09-29

사용자의 별도 서버 준비 요청에 따라 다음 운영 작업만 완료했다. [비밀 없는 검증 기록](evidence/career-server-prep-2026-09-29.json)을 함께 보관한다.

- DB custom-format 백업 두 개를 서버에 보존했다. `pg_restore --list` 및 SHA-256을 확인했으며 별도 DB에 복원하는 리허설은 하지 않았다.
- 전용 `ops/oci-runtime/migrate-pm.mjs`와 migration identity로 `20260929160000_career_better_auth`를 적용했다. 완료 이력은 9→10개, OAuth 테이블은 13개이며 모두 비어 있다. 기존 계정 3개의 기존 필드는 변경되지 않았고 `oauth_epoch=0`, 활성 OWNER 1명, trigger 및 런타임 계정의 테이블 읽기/쓰기 권한을 확인했다.
- 기존 앱 이미지에 새 SQL 하나만 추가한 일회용 migration 이미지를 사용했다. 태그는 내용 기반 digest이며 Git 커밋이 아니다. 최초 이미지 ID 지정 오류는 DB 변경 전에 발생했고, 동일 이미지 ID를 확인한 로컬 태그로 해결했다. 완료 후 해당 이미지·컨테이너·migration 전용 tmpfs 비밀·잠금을 제거했다.
- OAuth 무작위 비밀과 기존 Jev 키를 기존 Vault에 등록하고 version 1로 고정했다. 새 정책은 기존 host dynamic group과 egress 조건 아래 정확한 두 Secret의 bundle read만 허용한다. 다른 정책·Secret 값은 변경하지 않았다.
- 호스트 publisher의 PM optional allowlist 두 항목과 `/etc/oci-service-secrets/project-management.json`만 백업 후 갱신했다. `project-management-secrets.service`는 **reload**했고 restart하지 않았다. 기존 세 값은 보존됐으며 새 generation의 다섯 파일은 `root:987`, `0640`이다. 앱 권한으로 두 새 파일을 읽을 수 있음을 값 출력 없이 확인했다.
- 현재 host runtime release의 publisher 파일에 위 한 줄을 직접 반영했다. 소스에도 같은 변경이 있다. **다음 소스 전달에서 이 변경과 manifest를 함께 포함해야 하며, 이전 publisher만 복구하면 새 manifest를 거부한다.** 변경 전 파일은 `/var/backups/oci-vault-migration/career-secrets-kcr_mrdj`에 보존했다.
- 앱 이미지·PID·시작 시각은 유지했고 기존 로그인 HTTP 200 및 두 서비스 active를 확인했다. 앱은 기존 generation을 프로세스에 고정하므로 새 OAuth 기능은 아직 활성화되지 않았다. 로컬 `.env.local` 내용은 유지하고 권한만 `0600`으로 제한했다.

서버 준비 후 전체 테스트 481개 중 475 통과·기존 스킵 6·실패 0, Vault 관련 21개 중 20 통과·기존 스킵 1·실패 0, typecheck/build 통과. 별도 코드 검토에서 이번 Vault 변경의 Critical/Important 지적은 없었다. 해당 검토의 운영 IAM/DB 검증 제외 항목은 별도 실제 운영 조회로 확인했다.

위 최초 서버 준비에서는 커밋·푸시·앱 배포·ChatGPT 설정·브라우저 검증을 하지 않았다. 이후 앱 배포와 설정 활성화 상태는 아래와 같다.

## MCP/OAuth 활성화 — 2026-09-29

- 사용자가 제공한 callback `https://chatgpt.com/connector/oauth/fKDWttZ9fv__`(끝 밑줄 2개), client ID `career-chatgpt`를 사용했다. 기존 활성 OWNER를 읽기 확인하고 비밀이 아닌 설정 여섯 개만 서버에 적용했다.
- 배포된 `b6de208dffe0bd22c52cb0901889636e2c842706` 이미지를 그대로 사용해 앱 컨테이너를 재생성했다. 이미지·포트·마운트는 유지했고 recordings worker는 재시작하지 않았다. 두 비밀은 기존 Vault 파일로만 공급하며 embedding은 계속 비활성이다.
- 외부 HTTPS에서 로그인·resource metadata·authorization metadata·JWKS는 200, 미인증 MCP GET/POST는 metadata challenge를 포함한 401을 확인했다. JWKS의 키는 0개이며 GET으로 생성하지 않는다. 실제 OWNER 확인·동의·토큰 교환 성공을 의미하지 않는다.
- 첫 재생성 시도는 설치된 Compose의 `create`가 `--no-deps`를 지원하지 않아 실패했고 자동 복구도 같은 옵션으로 실패했다. 원래 설정·컨테이너를 확인한 뒤 기존 앱을 다시 시작해 로그인 200을 확인했다. 해당 옵션을 제거하고 의존 서비스 부재 확인 및 dry-run을 선행한 두 번째 시도에서 활성화했다. 무중단 작업은 아니었다.
- 서버 백업은 `/var/backups/oci-vault-migration/career-activation-hqsi8i_d`(첫 시도), `/var/backups/oci-vault-migration/career-activation-cdww30a3`(성공)에 보존한다. 환경 파일 백업은 서버 밖으로 복사하지 않았다.
- 이번 작업은 DB migration/데이터 쓰기·유료 Jev 호출·브라우저 조작·플러그인 게시를 하지 않았다. 임시 실행 스크립트의 컨테이너 부재 시 rollback 보완 지적은 재사용 금지 및 스크립트 삭제로 처리하며 배포 코드에 포함하지 않는다.
- 로컬 전체 테스트 481개 중 475 통과·기존 스킵 6·실패 0, typecheck/build, 배포 집중 테스트 3/3, 셸 구문 검사를 통과했다. 저장소 배포 변경의 독립 검토에서 차단 지적은 없었다.

**소스 전달과 남은 단계:** 활성화 당시 미커밋이었던 CI 업로드·배포 스크립트 변경을 이번 OAuth 호환성 수정과 함께 전달한다. 이전 소스의 CI로 되돌리면 재생성에서 Career 설정이 누락될 수 있다. 배포 완료 후 실제 ChatGPT에서 검색 재시도 → OWNER 로그인·동의 → MCP 실연결을 검증하고, 별도 승인된 평가 및 플러그인 교체를 진행한다. [비밀 없는 활성화 기록](evidence/career-activation-2026-09-29.json)의 소스 전달 상태는 활성화 당시의 스냅샷이다.

## 로컬 검증

2026-09-29 실제 ChatGPT 연결 시도에서 authorize 요청에 `ui_locales`가 포함되어 `OAUTH_REQUEST_DENIED`(400)가 발생했다. client/callback/resource/scope는 운영 설정과 일치했으며 로컬 재현에서 locale 항목 유무만으로 허용/거절이 갈렸다. 이를 선택적 표시 언어 힌트로 허용하되 최대 128자, 공백으로 구분한 ASCII 언어 태그 형식, 중복 금지를 적용했다. 인증·권한 판단에는 사용하지 않으며 브라우저에 결합한 원래 query는 재작성하지 않는다. 실제 Better Auth 처리기로 OWNER 확인·동의·PKCE 토큰 교환과 scope 보존을 회귀 검증했다. 수정 후 전체 테스트 485개 중 479 통과·기존 스킵 6·실패 0, 타입 검사·빌드 통과. **운영 재배포 및 ChatGPT 재시도 전에는 연결 오류가 해결됐다고 볼 수 없다.**

`NODE_OPTIONS=--experimental-strip-types pnpm test`, `pnpm typecheck`, `pnpm build`를 사용한다. DB 테스트는 `assertTestDatabase`가 허용한 `localhost:5432/project_management_test`만 사용한다. `pnpm dev`는 공유 DB 터널을 열기 때문에 OAuth 테스트에 사용하지 않는다.

`lib/server/career-oauth.test.mjs`는 mock issuer가 아닌 실제 Better Auth 핸들러와 테스트 DB로 code/PKCE/JWT/MCP 검증/refresh/재사용 거부/폐기 경쟁/동의 변조/웹 로그아웃/절대 만료를 검증한다. HTTP Request/Response 경계 테스트이며 운영 HTTPS 또는 실제 ChatGPT UI 검증을 대신하지 않는다. 브라우저 검증은 요청 시 별도로 한다.

2026-09-29 로컬 구현 검증 결과: 전체 481개 중 475개 통과, 기존 스킵 6개, 실패 0개. 타입 검사·빌드·스키마 차이 검사 통과. 빌드된 Next 서버의 실제 로컬 HTTP로 discovery/JWKS/MCP 401/가입 차단/잘못된 Host 거부를 확인했고 서버는 종료했다. 독립 보안 검토의 프록시 주소 처리 문제를 수정·재검증했으며 남은 Critical/Important 지적은 없다. 이 로컬 검증은 운영 배포·실제 ChatGPT·브라우저 검증을 대신하지 않는다.
