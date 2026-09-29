# 기존 OWNER 로그인 기반 Better Auth OAuth 연결 설계

상태: 2026-09-29 사용자 설계 승인 및 로컬 구현 요청. 사용자는 P-Grid 조회를 명시적으로 생략하고 그대로 구현하도록 요청했다. 로컬 코드·의존성·격리 테스트 DB 검증이 범위이며 운영 DB 변경·커밋·배포·플러그인 게시 승인은 별개다. 구체적인 구현과 배포 게이트는 [운영 안내](../../career-oauth.md)를 따른다.

## 1. 목적과 범위

일반 웹 ChatGPT에서 기존 취업 지원 플러그인을 사용하여 자기소개서를 작성하고, MCP를 통해 Jev 평가와 제한된 수정·전체 재평가를 수행한다. Work, 외부 인증 서비스 가입, 소셜 로그인, 새 사용자 비밀번호는 요구하지 않는다.

- 최초 연결 시 기존 Project Management OWNER 계정으로 본인을 확인하고 MCP 접근 권한에 동의한다.
- 이미 유효한 OWNER 웹 세션이 있으면 그 신원을 확인해 연결 절차를 이어간다. 세션이 없으면 기존 로그인 방식으로 인증한다.
- 최초 연결 후 OAuth refresh token으로 접근을 갱신한다. 연결 해제·보안 변경·refresh token 만료에는 재연결이 필요하다.
- 웹 로그인과 OAuth 연결의 수명은 구분한다. 일반 웹 로그아웃은 해당 브라우저 세션을 끝내며, 별도 연결 해제가 ChatGPT의 지속 접근을 끝낸다.
- 기존 OWNER/ADMIN/MEMBER 정책과 기존 로그인·계정 관리·프로젝트 자료는 보존한다.
- OAuth 동의는 자료의 Jev 전송·평가 스냅샷 저장 및 최종 원고 저장 요청을 대신하지 않는다.

## 2. 확인한 현재 코드

- `lib/access/store.ts`: `access_user` 및 `access_session` 기반 인증. 비밀번호 검증과 세션 발급의 동시성 보호가 존재한다. 비밀번호 변경은 기존 웹 세션을 폐기한다.
- `prisma/schema.prisma`: 현재 사용자에 이메일 필드는 없고, username/name/passwordHash/role/active가 있다.
- `proxy.ts`: 기본 OWNER 접근 정책, 동일 Origin 변경 요청 검사, 특정 MCP/discovery 경로 예외가 있다.
- `lib/career/auth.ts`: 외부 issuer/JWKS를 사용하는 JWT 검증만 존재한다. RS256/ES256, audience, subject, client identity, scope 및 현재 활성 OWNER를 검사한다.
- 현재 MCP SDK는 `@modelcontextprotocol/sdk` v1 계열이다. Better Auth는 아직 설치되어 있지 않다.
- 이전 Jev 개선 작업의 미커밋 변경은 이 작업과 분리해 보존한다.

## 3. 접근 방식 비교와 권고

1. **권고: 기존 로그인 유지 + Better Auth OAuth Provider + 제한된 OWNER 세션 연결.** 기존 계정 체계를 보존한다. 인증 결과를 Better Auth의 세션으로 연결하는 좁은 서버 측 구현과 회귀 검증이 필요하다.
2. 전체 웹 로그인을 Better Auth로 이전: 인증 체계는 통합되지만 모든 계정·비밀번호·세션·권한 처리의 이전 범위가 크다. 이번 범위에서 제외한다.
3. 독립 OAuth 서버 프로세스 운영: 격리는 가능하지만 별도 배포·인증 전달 경로가 추가된다. 이번 범위에서 제외한다.

Better Auth의 OAuth Provider를 인증 서버로 쓰고 현재 MCP 도구/전송 계층은 유지하는 구성을 우선한다. 최신 `@better-auth/mcp` 안내는 MCP SDK v2를 전제로 하므로 그 예제를 그대로 붙이거나 두 OAuth Provider를 중복 등록하지 않는다. 실제 배포 가능한 패키지 버전을 고정하고 provider와 기존 resource server 간 호환 테스트를 통과해야 채택한다.

## 4. 인증 흐름 및 경계

1. ChatGPT가 기존 MCP의 protected-resource metadata에서 우리 서버의 issuer를 발견한다.
2. Better Auth가 등록된 ChatGPT client, 정확한 redirect URI, resource, 요청 scope 및 PKCE S256을 검증한다.
3. 로그인 필요 시 전용 연결 페이지로 이동한다. 유효한 DB 기반 OWNER 세션만 허용하고 bootstrap·ADMIN·MEMBER는 거절한다.
4. 브라우저의 동일 Origin POST와 CSRF 방어를 거쳐 서버가 OAuth 로그인 세션을 만든다. 클라이언트 입력의 user ID·role·username·이메일로 OWNER를 선택하지 않는다.
5. 요청한 권한과 지속 접근 여부를 표시하고 사용자 승인 후 provider가 authorization code를 반환한다.
6. ChatGPT가 코드를 token endpoint에서 교환하고, MCP는 access token을 검증하여 기존 도구를 실행한다.
7. 유효한 refresh grant는 재로그인 없이 갱신하되, 현재 OWNER 상태와 grant 폐기 여부를 다시 검사한다.

기존 쿠키를 bearer token으로 사용하거나 JWT/authorization code를 자체 제작하지 않는다. 세션 연결은 고정한 Better Auth 버전에서 제공하는 확장 지점을 통해 수행하며 쿠키 서명을 흉내 내거나 DB에 임의의 세션 행만 삽입하지 않는다. 지원되는 확장 지점으로 이 계약을 충족하지 못하면 통합 방식을 재검토하고 전체 로그인 이전으로 자동 확대하지 않는다.

## 5. 계정·저장·권한

- `access_user`가 신원·활성 상태·역할의 원본이다. 기존 비밀번호 해시를 Better Auth에 복제하거나 변환하지 않는다.
- Better Auth가 요구하는 OAuth용 내부 사용자 레코드는 기존 OWNER ID와 서버 소유의 일대일 매핑으로 연결한다. 이는 별도 가입 계정이 아니다.
- 라이브러리 필수 필드 중 현재 계정에 없는 이메일은 실제 이메일을 추정하거나 검증됐다고 표시하지 않는다. 비전달용 내부 식별자가 필요하면 예약 도메인 `.invalid`를 사용하고 메일 발송·이메일 로그인·이메일 기반 연결·공개 email claim을 비활성화한다. 이 처리의 라이브러리 호환성도 테스트한다.
- Better Auth의 사용자/세션/검증/서명키 및 OAuth client/consent/token 저장 모델은 별도 `career_oauth_*` 이름으로 매핑한다. 계정 데이터는 기존 테이블로 덮어쓰지 않는다.
- access token은 짧은 수명(초안 기준 15분), refresh grant는 절대 만료(초안 기준 30일), refresh token rotation과 재사용 탐지를 적용한다. 공개 클라이언트의 임의 scope 확대를 금지한다.
- `career:read`, `career:evaluate`, `career:write`를 구분하고 지속 접근에는 `offline_access`를 사용한다. 저장 권한이 없으면 조회·평가 토큰으로 저장할 수 없다.
- 최초 버전은 ChatGPT 연결 화면에서 확인한 client와 callback을 사전 등록한다. 공개 사용자 가입, 공개 client 생성 API, 임의 DCR/CIMD 클라이언트 허용은 비활성화한다.
- 기존 계정 비밀번호 변경·승인된 계정 비활성화·OAuth 연결 해제는 해당 OWNER의 OAuth 보안 세대를 증가시킨다. 세션/grant에 묶인 이전 세대로 새 code나 token을 발급하지 않는다. refresh를 통해 새로운 세대로 자동 승격하지 않는다.
- MCP는 서명/issuer/audience/만료/scope/client identity 외에도 현재 OWNER 및 OAuth 보안 세대를 검사하여 이미 발급된 access token도 차단한다. DB 장애 시 접근을 거절한다.
- grant 발급/갱신과 폐기는 같은 계정의 잠금/트랜잭션으로 직렬화하여 비밀번호 변경 직후 새 grant가 살아남는 경쟁을 방지한다.

## 6. 경로와 시크릿

- 인증 서버의 기준 경로는 `/api/career-auth`, 연결·동의 화면은 `/career/connect`, `/career/consent`로 분리하는 것을 제안한다.
- issuer는 `https://project.dev-uk.shop/api/career-auth`, resource는 기존 `https://project.dev-uk.shop/mcp/career`를 유지한다. 외부 노출 전 실제 metadata/JWKS 경로를 provider가 생성하는 규약과 대조한다.
- `proxy.ts` 예외는 필요한 OAuth metadata/JWKS/authorize/token/revocation 경로와 HTTP method로 한정한다. 전체 `/api` 또는 인증 prefix의 모든 endpoint를 무조건 공개하지 않는다.
- 서버 간 token 교환은 PM 쿠키/동일 Origin을 요구하지 않지만 OAuth client·PKCE·grant 검증을 반드시 거친다. 브라우저 세션 연결·동의·연결 해제는 별도로 CSRF를 방어한다.
- return URL은 서버가 보관한 일회성 OAuth 요청에 결합한다. 임의 외부 URL 및 변조된 authorize 쿼리로 복귀하지 않는다.
- 운영 대칭 비밀과 서명키는 기존 OCI Vault 기반 관리 원칙을 따른다. 라이브러리가 서명키를 DB에 저장하는 방식을 택하면 private key 보호 방식, 암호화 키 보관, 회전/이전 공개키 유지 기간을 보안 매뉴얼과 대조한 뒤 구현한다. 평문 private key를 기본값이라는 이유로 수용하지 않는다.
- OpenRouter 키는 계속 서버 전용이다. OAuth client나 웹 플러그인에 포함하지 않는다.

## 7. 구현 전 확인과 승인 게이트

초기 조사에서 P-Grid 인증이 불가능했으나 이후 사용자가 이번 로컬 구현에서는 P-Grid 조회를 생략하도록 명시했다. 기존 저장소의 보안·DB 경계와 운영 승인 게이트는 유지한다. 운영 DB에는 연결하거나 변경하지 않았다.

이 문서 검토 후 구현 계획 단계에서 다음을 고정한다.

- 설치 가능한 Better Auth/provider/JWT 버전과 Next.js·Prisma·MCP SDK 호환 조합.
- 지원되는 서버 세션 생성 확장 지점, OAuth grant/refresh 검증 및 원자적 폐기 연결 방식.
- 라이브러리가 실제 발급하는 alg/iss/aud/sub/client_id/scope와 기존 검증기의 일치 여부. 현재 허용 알고리즘은 임의로 완화하지 않는다.
- 인증용 실제 모델/인덱스/제약, 시크릿 및 서명키 저장 방식.

검증 불가 항목은 구현 완료로 처리하지 않는다. 운영 DB에는 문서 예제의 자동 migration 명령을 실행하지 않는다. 별도 forward migration과 적용 전 읽기 검사·검증된 백업·명시적 승인이 필요하다.

## 8. 검증 및 완료 조건

로컬 테스트 DB `localhost:5432/project_management_test`만 사용한다. 기본 `pnpm dev`는 공유 DB를 사용하므로 인증 실험에 쓰지 않는다.

- 기존 OWNER/ADMIN/MEMBER 로그인, 비밀번호 변경, 공유 링크, 개인 자료 접근 회귀 테스트.
- bootstrap·비활성·비OWNER 계정의 브리지/code/token/MCP 접근 거부.
- CSRF, 외부 return URL, 변조된 동의 요청, 재사용된 bridge/code, 잘못된 redirect/client/resource/PKCE 거부.
- access token 만료, refresh rotation/재사용, scope 축소 및 무단 확대 거부.
- 비밀번호 변경·비활성화·연결 해제와 발급/refresh 동시 실행 후 이전 접근권한 복원 금지.
- OAuth 기본 경로 외 앱 API가 기존 인증을 우회하지 않음을 확인.
- 최초 동의 뒤 반복 호출에 로그인 요구가 없는지 확인하고, 만료/폐기 뒤 재연결 동작을 검증.
- `pnpm typecheck`, `pnpm build`, 관련 단위/로컬 통합 테스트. 브라우저 검증은 별도 명시 요청 때만 수행.

코드 검증, 공유 DB 적용, 운영 배포, 플러그인 교체, 일반 웹 ChatGPT 종단간 검증은 각각 별도 상태로 보고한다. 설계 승인이나 로컬 구현 완료는 뒤 단계의 승인/완료를 의미하지 않는다.

## 근거

- [OpenAI OAuth 인증 요구사항](https://developers.openai.com/plugins/build/auth)
- [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth MCP 구성과 SDK 경계](https://better-auth.com/docs/plugins/mcp)
- [Better Auth 플러그인 확장](https://better-auth.com/docs/guides/your-first-plugin)
- 프로젝트의 `docs/account-access.md`, `docs/career-quality-runtime.md`, `AGENTS.md` 및 현재 인증 코드.
