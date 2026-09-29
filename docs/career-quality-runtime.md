# 일반 Chat용 자기소개서 품질 MCP

2026-09-29 로컬 구현. **운영 배포·OAuth 연결·유료 Jev 실호출·ChatGPT 웹 검증·플러그인 게시 전**이다. [평가 설계](career-quality-design.md), [데이터 규약](career-quality-contract.md)의 첫 실행 버전이며 점수는 AI 작성 확률이나 채용 합격 확률이 아니다.

## 사용 흐름

일반 Chat의 플러그인 → 원격 MCP → 기존 OWNER 자료/평가 세션 → Jev 판정 → ChatGPT의 제한된 수정 → 전체 회귀 평가. Work나 ChatGPT 대화 자동 수집을 요구하지 않는다.

| 도구 | 역할 | scope |
| --- | --- | --- |
| career_contract | 실제 JSON 입력/수정 스키마와 평가표 | career:read |
| career_audit | 코드포인트·공백 제외·UTF-8 바이트·UTF-16 계산 | career:read |
| career_list_documents | 선택한 종류의 채용 자료 요약, 50개 단위 | career:read |
| career_get_document | 선택한 문서 한 개와 revision/출처 원문 | career:read |
| career_evaluate | 외부 전송 동의 후 최초 전체/실패 문단 평가 | career:evaluate |
| career_session | 저장된 평가 세션 읽기, 외부 호출 없음 | career:read |
| career_rewrite | 해시/범위 검사 후 수정 후보 전체 재평가 | career:evaluate |
| career_save_draft | 별도 명시 요청으로 채택 원고 저장 | career:write |

모든 도구에 career:read가 기본으로 필요하다. 평가 도구는 OpenRouter/TypeSafe로 선택 자료를 전송하고 평가용 스냅샷을 비공개 DB에 보관한다. 외부 전송/보관 동의와 최종 자기소개서 문서 저장 동의를 구별한다. 도구의 boolean은 사용자 동의를 대신하는 보안 증명이 아니므로 ChatGPT 호출 확인과 스킬 지침을 함께 적용한다.

## 코드와 저장

- `lib/career/core.ts`: 엄격한 입력 검증·출처 인용·코드포인트·해시·AND/OR 조건.
- `rubric.ts`, `jev.ts`, `evaluator.ts`: 서버 소유 평가표, 고정 OpenRouter endpoint/model, 응답 검증, 전체/문단 검사, 점수/상태.
- `rewrite.ts`: 평가 ID·초안 해시·원문 일치, 범위 외 변경 차단, 전체 회귀 비교.
- `lib/server/career-store.ts`: `app_setting`의 별도 `career:session:<id>`에 OWNER ID와 CAS revision, 초안/결과 이력, 현재 채택 버전, 누적 외부 시도 수 저장.
- `mcp.ts`, `auth.ts`, `lib/server/career-http.ts`: stateless Streamable HTTP와 외부 OAuth JWT 검증. HTTP 세션과 평가 세션은 별개다.

새 Prisma migration은 없다. 평가 실행 시에만 평가 키를 생성한다. 기존 `recruitment:document:*`는 명시적 저장 도구만 수정한다. credentials·AI 활동 원문·embedding 관련 코드/설정은 읽거나 변경하지 않는다.

최초 평가의 requestId는 재전송 시 동일하게 유지한다. OWNER ID와 requestId로 안정된 세션 ID를 만들고 같은 ID의 다른 input은 거절한다. 동시 요청 하나만 평가를 실행한다. 외부 호출 전에 시도 수를 CAS로 기록하므로 timeout/프로세스 중단도 예산에 포함한다. 최대 12회/세션, 초기 이후 수정 후보 최대 2개. 오류 본문·API 키·전송 원문을 로그에 출력하지 않는다. 실제 provider request ID/model/usage/cost는 완료 결과에 남긴다.

RUNNING 세션은 읽기 가능하나 자동 재시작하지 않는다. 프로세스 중단 시 과금 여부가 불명인 호출을 재전송하지 않기 위한 fail-closed 정책이다. 완료 결과가 없다면 운영자가 원인을 확인하고 사용자가 새 평가를 요청해야 한다. 스냅샷 자동 만료·삭제는 구현하지 않았다. 삭제/보관 정책을 바꾸려면 별도 승인된 데이터 작업이 필요하다.

진행 중 검사 계획·완료 범위와 응답 request ID/model/usage를 요청 사이에도 progress에 저장한다. 중단된 세션을 읽으면 마지막 확인된 검사 범위를 알 수 있다. 아직 응답을 받지 못한 요청은 성공으로 추정하지 않는다.

문서 저장은 소유자·세션 행 잠금, 문서 revision 및 JSON CAS를 한 트랜잭션에서 검사한다. 저장 결과가 세션에 기록되어 같은 저장 재전송으로 revision을 또 올리지 않는다. 충돌 시 문서와 후보를 보존한다.

## 첫 버전의 명시적 제한

- 자동 Jev 평가는 전체 → 실패 문단 → 수정 후보 전체다. 문장별 추가 Jev 호출과 큰 원고를 위한 분할/교차문맥 평가는 아직 없다. ChatGPT는 실패 문단 안에서 문장을 진단할 수 있으나 Jev 문장 평가라고 표시하지 않는다.
- 모델 입력은 요청 전체 UTF-8 **28,000 bytes** 상한이다. 토크나이저 구현이나 정확한 토큰 수를 주장하지 않는 보수적 제한이다. 초과하면 INCOMPLETE로 종료하며 원문을 조용히 자르지 않는다. 원문 일부로 새 평가를 하면 전체 평가가 아님을 표시한다.
- PROJECT_RECORD 직접 import는 거절한다. 사용자 제공 사실과 선택한 EXPERIENCE/PORTFOLIO 문서 근거를 지원한다. COVER_LETTER 자체는 사실 출처로 거절한다.
- requirementMatches는 요건별 판정을 제공한다. 개별 사실별 지원 관계까지 별도 판정하지 않으므로 반환 factIds는 빈 배열이다. 연결 후보만으로 검증된 증거라고 표시하지 않는다.
- voice_alignment는 기준 글이 있을 때만 참고 진단하며 기본 총점에서 제외한다. 실제 모델 스냅샷이 섞이면 REVIEW. 모델을 속일 수 없다는 보장은 없으며 원문 명령을 데이터로 취급하도록 지시하고 권한/범위는 코드가 제한한다.
- 임계값과 한국어 품질 개선 효과는 아직 실제 자료로 보정되지 않았다. 합성 응답 테스트 통과는 Jev 판단 정확도 증명이 아니다.

## OAuth와 비밀정보 설정

기본 `CAREER_MCP_ENABLED` 미설정/false는 endpoint와 discovery를 404로 닫는다. true인데 필수 구성이 빠지면 503으로 닫는다. 기존 웹 로그인 쿠키를 원격 MCP 토큰으로 재사용하지 않는다.

기존에 검증된 OAuth 2.1/OIDC 인증 제공자를 **별도 선택·설정**해야 한다. 이 변경은 자체 인증 서버를 만들거나 외부 서비스를 자동 등록하지 않는다. 제공자는 ChatGPT의 OAuth 연결 방식에 맞춰 Authorization Code + PKCE, OAuth metadata, resource audience, 정확한 redirect URI/client 등록을 지원해야 한다. 지원되는 client 등록 방식(CIMD/DCR/사전 등록)은 제공자와 ChatGPT 연결 화면에서 확인한다.

필요한 비밀이 아닌 런타임 설정:

| 변수 | 값 |
| --- | --- |
| CAREER_MCP_ENABLED | 기본 false, 준비 후 명시적으로 true |
| CAREER_MCP_RESOURCE | `https://project.dev-uk.shop/mcp/career` |
| CAREER_MCP_ISSUER | 인증 제공자의 정확한 issuer URL |
| CAREER_MCP_JWKS_URL | issuer와 같은 origin의 HTTPS JWKS URL |
| CAREER_MCP_SUBJECT | 허용할 외부 사용자 sub 하나 |
| CAREER_MCP_OWNER_ID | 연결할 기존 활성 OWNER의 실제 DB ID |
| CAREER_MCP_CLIENT_ID | 등록한 ChatGPT OAuth client ID |

JWT는 RS256/ES256 서명, issuer, resource audience, sub, iat/exp(최대 1시간), client_id 또는 azp, scope를 확인한다. 두 client 식별 claim이 있으면 모두 등록값과 같아야 한다. 이후 DB의 현재 active/OWNER를 매 요청/도구/외부 시도마다 확인한다. AS의 토큰 회수 정책은 별도 검증해야 한다. PM OWNER 비활성화나 기능 flag off로 연결을 즉시 차단할 수 있다.

공개 discovery: `/.well-known/oauth-protected-resource/mcp/career`. MCP 인증 실패는 WWW-Authenticate로 이 주소를 안내한다. proxy 예외는 이 discovery 읽기와 정확한 `/mcp/career` 경로만이며 나머지 사이트의 쿠키 인증·same-origin 정책은 유지한다. Host는 resource host, Origin이 있으면 사이트 origin 또는 `https://chatgpt.com`만 허용한다.

`OPENROUTER_API_KEY`는 기존 OCI Vault → 보호된 runtime generation의 선택 파일로 읽을 준비만 추가했다. 실제 Vault secret 생성, 서비스 manifest의 secret ID/version 등록, read 권한, runtime 재발급/재시작은 미실행이다. 파일 모드가 설정되면 env의 키로 fallback하지 않는다. 로컬 환경변수는 개발용 fallback일 뿐 운영 배포 방식이 아니다. 키는 ZIP/Git/Chat에 넣지 않는다.

`docker-compose.vault.yml`은 environment 전체를 override하므로 활성화할 때 위 **비밀이 아닌** CAREER 설정을 이 마지막 overlay에도 명시해야 한다. 현재 overlay는 변경하지 않았다. DB 공개 포트나 새 장기 PM API 키는 만들지 않는다. Nginx의 인증 헤더 전달·Host·요청 제한/timeout도 배포 시 별도 확인한다.

2026-09-29 P-Grid `security-principles`, `infrastructure-design-manual` 읽기는 Unauthorized였다. 기존 프로젝트 보안 규칙으로 로컬 구현했으며, **운영 설정 전 최신 매뉴얼을 다시 읽어 검토해야 한다**.

## 플러그인 업데이트 준비

소스: `plugins/career-application-toolkit`, 후보 버전 0.3.0. 기존 5개 스킬과 기본 프롬프트 3개를 보존했다. 원격 플러그인 읽기 기준:

- plugin ID: `plugins_6ab8babf0a648191a7f0c75222162b04`
- 현재 버전: 0.2.0
- 확인한 release: `pluginrel_6ab8ec182acc81919280c418835eae34`

```bash
node scripts/package-career-plugin.mjs --check --baseline /Users/janguk/Downloads/plugin.zip
node scripts/package-career-plugin.mjs --output /Users/janguk/Downloads/career-application-toolkit-0.3.0.zip --baseline /Users/janguk/Downloads/plugin.zip
```

패키지 검사는 manifest 동기화, 5개 스킬 frontmatter·참조 경로, 기존 프롬프트·무관한 원본 파일의 byte 보존, 비밀파일/헤더 부재, ZIP 무결성을 확인한다. 기존 출력 ZIP은 덮어쓰지 않는다. 스킬 기본 Python validator는 로컬 PyYAML 부재로 실행되지 않아 이 패키지 검사와 별도 가상 사용자 시나리오 검토로 보완했다. 일반 Chat의 실제 동작 검증은 아직 아니다.

배포 전 ZIP은 **게시 대기 후보**다. 미배포 MCP 주소가 들어 있으므로 현재 웹 플러그인을 바로 교체하지 않았다. 게시 직전에 현재 release를 다시 읽고 변경 여부를 확인한 뒤 `expected_release_id`를 적용한다. 게시 후 파일 read-back 및 새 일반 Chat에서 인증·조회·합성 평가·충돌 시나리오를 확인한다.

## 운영 적용 순서 — 아직 미실행

1. 최신 보안 매뉴얼 조회 복구, OAuth 제공자/클라이언트/OWNER 매핑 결정.
2. 별도 승인 후 Vault 키 등록·권한 설정 및 비밀 아닌 런타임 설정 추가.
3. 승인된 앱 배포. 공유 DB migration은 필요 없으나 최초 실제 평가 전에 평가용 저장·외부 전송 동의.
4. discovery/토큰 거절/OWNER 확인/합성 Jev 평가로 준비 상태 확인. 평가 기준 보정은 별도 작업.
5. 승인된 플러그인 0.3.0 게시와 파일 재조회.
6. 사용자의 일반 Chat에서 연결 및 실제 작성/수정 확인. 브라우저 검증은 사용자 요청 때만 한다.

## 검증 명령

```bash
NODE_OPTIONS=--experimental-strip-types pnpm test
pnpm typecheck
pnpm build
node scripts/package-career-plugin.mjs --check --baseline /Users/janguk/Downloads/plugin.zip
```

DB 테스트는 기존 guard가 검사한 로컬 `localhost:5432/project_management_test`만 사용한다. 테스트는 가상 자료와 합성 Jev 응답을 사용하며 외부 유료 API를 호출하지 않는다.

공식 연결 규약: [OpenAI 플러그인 인증](https://developers.openai.com/plugins/build/auth), [MCP 서버](https://developers.openai.com/plugins/build/mcp-server), [Jev Decisions API](https://openrouter.ai/blog/insights/what-is-jev/), [portable MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json). 2026-09-29 확인.
