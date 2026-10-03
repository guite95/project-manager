# 일반 Chat용 자기소개서 품질 MCP

2026-09-29 로컬 구현 및 **가상 자료 Jev 실호출 검증 완료**. 운영 앱 배포·MCP/OAuth 설정 활성화·공개 HTTPS 검색정보 검증까지 완료했으며 실제 ChatGPT OAuth 연결·웹 검증·플러그인 게시는 아직이다. [평가 설계](career-quality-design.md), [데이터 규약](career-quality-contract.md)를 구현하며 점수는 AI 작성 확률이나 채용 합격 확률이 아니다. 실제 사용자 자료의 정확도는 검증하지 않았다.

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
- `mcp.ts`, `auth.ts`, `lib/server/career-http.ts`: stateless Streamable HTTP와 OAuth JWT 검증. HTTP 세션과 평가 세션은 별개다. 자체 인증은 [Better Auth 운영 안내](career-oauth.md)를 따른다.

평가 기능 자체에는 Prisma migration이 없으며 평가 실행 시에만 평가 키를 생성한다. Better Auth의 별도 `20260929160000_career_better_auth` migration은 2026-09-29 서버 준비에서 검증된 백업 후 전용 migration identity로 운영 적용했다. 기존 `recruitment:document:*`는 명시적 저장 도구만 수정한다. credentials·AI 활동 원문·embedding 관련 코드/설정은 읽거나 변경하지 않는다.

최초 평가의 requestId는 재전송 시 동일하게 유지한다. OWNER ID와 requestId로 안정된 세션 ID를 만들고 같은 ID의 다른 input은 거절한다. 동시 요청 하나만 평가를 실행한다. 외부 호출 전에 시도 수를 CAS로 기록하므로 timeout/프로세스 중단도 예산에 포함한다. 최대 12회/세션, 초기 이후 수정 후보 최대 2개. 오류 본문·API 키·전송 원문을 로그에 출력하지 않는다. 실제 provider request ID/model/usage/cost는 완료 결과에 남긴다.

RUNNING 세션은 읽기 가능하나 자동 재시작하지 않는다. 프로세스 중단 시 과금 여부가 불명인 호출을 재전송하지 않기 위한 fail-closed 정책이다. 완료 결과가 없다면 운영자가 원인을 확인하고 사용자가 새 평가를 요청해야 한다. 스냅샷 자동 만료·삭제는 구현하지 않았다. 삭제/보관 정책을 바꾸려면 별도 승인된 데이터 작업이 필요하다.

진행 중 검사 계획·완료 범위와 응답 request ID/model/usage를 요청 사이에도 progress에 저장한다. 중단된 세션을 읽으면 마지막 확인된 검사 범위를 알 수 있다. 아직 응답을 받지 못한 요청은 성공으로 추정하지 않는다.

문서 저장은 소유자·세션 행 잠금, 문서 revision 및 JSON CAS를 한 트랜잭션에서 검사한다. 저장 결과가 세션에 기록되어 같은 저장 재전송으로 revision을 또 올리지 않는다. 충돌 시 문서와 후보를 보존한다.

## 첫 버전의 명시적 제한

- 자동 Jev 평가는 전체 → 실패 문단 → 수정 후보 전체다. 문항별 검사에는 해당 답변 전체와 필요한 자료를 묶어 보내고, 내부 모순 G3에는 모든 답변을 유지한다. 실패 문단 검사도 해당 답변 전체와 인접 문단을 유지한다. G3 문단 진단은 현재 답변과 다른 답변을 각각 한 번만 보내고, 현재·인접 문단을 코드포인트 범위로 지정하여 본문 중복을 줄인다. 문장별 추가 Jev 호출은 없다. ChatGPT는 실패 문단 안에서 문장을 진단할 수 있으나 Jev 문장 평가라고 표시하지 않는다.
- 모델 입력은 요청 전체 UTF-8 **28,000 bytes** 상한이다. 토크나이저 구현이나 정확한 토큰 수를 주장하지 않는 보수적 제한이다. 검사 묶음에 필요한 문항·자료만 선택하고 실제 요청 크기에 맞춰 묶음을 나눈다. 사실성 G2와 경험 구체성 Q5에는 확인된 사실과 연결 원자료 전체, Q2에는 관련 JD 요건, G5에는 명시 조건, 문체 참고 진단에는 기준 글을 제공한다. JD 경험 판정도 묶음의 요건만 보내며 사실·원자료는 유지한다. 원고·원자료를 자르거나 요약하지 않고, 단일 검사도 상한을 넘으면 누락 범위를 남겨 INCOMPLETE로 종료한다.
- PROJECT_RECORD 직접 import는 거절한다. 사용자 제공 사실과 선택한 EXPERIENCE/PORTFOLIO 문서 근거를 지원한다. COVER_LETTER 자체는 사실 출처로 거절한다.
- requirementMatches는 요건별 판정을 제공한다. 개별 사실별 지원 관계까지 별도 판정하지 않으므로 반환 factIds는 빈 배열이다. 연결 후보만으로 검증된 증거라고 표시하지 않는다.
- voice_alignment는 기준 글이 있을 때만 참고 진단하며 기본 총점에서 제외한다. 실제 모델 스냅샷이 섞이면 REVIEW. 모델을 속일 수 없다는 보장은 없으며 원문 명령을 데이터로 취급하도록 지시하고 권한/범위는 코드가 제한한다.
- 임계값과 한국어 품질 개선 효과는 아직 실제 자료로 보정되지 않았다. 합성 응답 테스트 통과는 Jev 판단 정확도 증명이 아니다.

## Jev 평가 개선과 재현 가능한 실험

평가표·정책 식별 버전은 `0.2.0`, 검사별 입력 구성의 프롬프트 버전은 `0.3.0`이다. 입력 계약과 저장 namespace는 변경하지 않았다. 다른 평가표·정책·프롬프트·분할 버전의 결과끼리는 개선 점수를 비교하여 후보를 자동 채택하지 않는다.

- 확인된 활성 사실과 연결 원자료를 먼저 검사한다. 자료 없음은 결정적으로, 충돌/낮은 확신도는 보수적으로 G2 `UNKNOWN`으로 처리하고 사실성 확정 및 자동 수정을 보류한다. 인용 밖의 정정 문맥을 놓치지 않도록 연결된 원자료 전체를 유지한다. 사실 없음과 사실 위반은 다르다.
- 실제 경험/JD 요건 판정은 원고 없이 별도 요청한다. 글의 JD 연결 점수 Q2와 경험 부합 `requirementMatches`를 구별한다. 요건 판정도 confidence 0.70 미만이면 UNKNOWN/REVIEW로 보류하여 지원 자격 MET으로 승격하지 않는다.
- G1(문항 답변), G2(사실성), G3(원고 내부 모순), G5(명시 형식)를 독립적인 선택지로 평가한다. 형식 조건이 없으면 G5는 적용 제외다. 높은 다른 점수가 사실성 위반을 상쇄하지 않는다.
- 문단 진단에도 전체 해당 답변과 인접 문단·원자료를 제공한다. 명확하지 않은 판단을 강제로 통과시키거나 낮은 확신도 기준을 낮추지 않았다.
- 실제 응답에는 가중평균 3.25와 score 3.29 등 단순 최근접 반올림만으로 설명되지 않는 차이가 있었다. 확률별 ±0.01, score ±0.005의 **경험적 호환 범위** 안에 합계 1의 분포가 존재하는지 검사한다. 공급자가 보장한 반올림 알고리즘이라는 뜻이 아니다. 음수/누락/잘못된 선택/범위 밖 점수/큰 불일치는 거절하며 원래 수치는 정규화하지 않고 보존한다.
- 응답 내용 검증 전에 유효한 요청 ID/model/usage/cost를 기록한다. 예상하지 않은 모델도 비용은 기록하지만 평가로는 거절한다. receipt가 없거나 네트워크 오류가 나면 비용 미확정으로 표시하며 무료로 단정하지 않는다.
- 검사 ID에 종류와 문단 구분을 포함하여 `evidence`, `G3` 같은 사용자 요건 ID와 충돌하지 않는다.

키는 Git에서 제외된 `.env.local`의 `OPENROUTER_API_KEY` 또는 현재 프로세스 환경변수로만 넣는다. CLI는 가상 fixture만 사용하며 DB 모듈을 import하지 않는다. 명시적 `--live`가 없으면 키를 읽거나 API를 호출하지 않는다.

```bash
# 무료: 계획/기대 판정/fixture hash 확인
node --experimental-strip-types scripts/career-jev-probe.mjs --suite holdout
# 유료: 보정용 사례 (일반 테스트와 완전히 분리)
node --experimental-strip-types scripts/career-jev-probe.mjs --live --suite calibration --max-calls 12 --max-cost 0.03
# 유료: 원하는 사례만 재검증
node --experimental-strip-types scripts/career-jev-probe.mjs --live --suite holdout --case hold-off-topic,hold-source-conflict --max-calls 10 --max-cost 0.02
```

회당 최대 60회, 보고 비용 최대 $0.10까지만 CLI 옵션을 허용한다. 전송 전에 $0.002 여유를 확보하고, 알 수 없는 과금/응답 오류 뒤에는 중단한다. 이는 공급자 측 hard spending cap이 아니라 **보고된 비용 기준의 로컬 중단 장치**다. 여러 실행의 누적 한도는 사용자가 별도로 관리해야 한다. stdout JSONL에 요청별 영수증과 실패/보류를 포함한 요약을 출력하며 키·원고·원시 오류 본문을 출력하지 않는다.

### 2026-09-29 결과

[검증 기록 JSON](evidence/career-jev-2026-09-29.json)에 fixture hash, 기대/실제 판정, 모델 snapshot, 요청 ID와 비용을 남겼다. 이번 구현 작업에서 총 57회, 보고 비용 **$0.005491458**, 비용 미확정 0회다. 앞선 대화의 탐색 실험 비용은 포함하지 않는다.

- 보정 사례 3건: 목표 검사 4개 통과, 8회 호출.
- 최초 별도 사례: 목표 검사 8개 통과·1개 보류 후 7번째 사례에서 파서 오류로 중단, 25회 호출. 남은 3개 검사는 미실행으로 기록했다.
- 파서 원인 확인: 1회. 실제 3.29/3.25 응답을 단위 테스트로 고정했다.
- 호환 범위·원자료 문맥·검사 ID 보완 후 선택한 별도 사례 6건: 목표 검사 10개 통과, 23회 호출. 새로운 수치 날조, 답 누락, 내부 모순, 원고와 독립적인 JD 경험 판정, 출처 충돌을 확인했다.
- 팀 기여 과장·계획의 완료 처리·자료 없음 3건은 최초 별도 실험에서 통과했으며 마지막 수정 후 다시 호출하지 않았다. 사례 문구/정답을 결과에 맞춰 바꾸지 않았다.
- 실호출 종료 후 낮은 확신도의 요건 판정을 지원 자격 MET으로 승격하던 경로도 단위 회귀 테스트로 수정했다. 추가 실호출은 하지 않았으며 최종 실험의 직무 부합 판정 확신도는 모두 0.99 이상이었다.

작은 수작업 가상 사례 검증이지 일반 자소서 정확도 백분율이 아니다. 최종 사례의 종합 상태는 `REVIEW` 또는 `NEEDS_INPUT`이었다. 개별 목표 검사 통과와 원고 전체 자동 승인/수정 가능을 혼동하지 않는다. 실제 사용자의 판단과 비교하는 추가 평가가 필요하다.

## OAuth와 비밀정보 설정

기본 `CAREER_MCP_ENABLED` 미설정/false는 endpoint와 discovery를 404로 닫는다. true인데 필수 구성이 빠지면 503으로 닫는다. 기존 웹 로그인 쿠키를 원격 MCP 토큰으로 재사용하지 않는다.

현재 운영은 기존 OWNER 계정을 사용하는 자체 Better Auth로 결정했다. 외부 Auth0·카카오 계정은 필요하지 않으며 정확한 callback과 사전 등록 public client, PKCE S256을 사용한다. 자체 인증의 추가 설정·15분 토큰·폐기 정책은 [Better Auth 운영 안내](career-oauth.md)를 따른다. 아래 issuer/JWKS/subject 표와 일반 JWT 설명은 외부 인증 모드 기준이며 자체 모드에서는 파생값을 사용한다.

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

2026-09-29 서버 준비에서 `OPENROUTER_API_KEY`, `CAREER_OAUTH_SECRET`을 기존 OCI Vault에 등록했다. manifest에 정확한 secret ID/version을 고정하고 기존 호스트 dynamic group·egress 조건으로 두 secret의 bundle read만 허용했다. 최초 준비에서는 publisher만 reload했으며 이후 승인된 앱 배포·설정 활성화로 앱에도 제공했다. 파일 모드가 설정되면 env의 키로 fallback하지 않는다. 키는 ZIP/Git/Chat에 넣지 않는다.

`docker-compose.vault.yml`은 environment 전체를 override하므로 활성화할 때 **비밀이 아닌** CAREER 설정을 담은 `docker-compose.career.yml`을 기존 Vault/identity/recordings override 뒤에 추가한다. 서버에 적용했으며 CI 업로드·자동 포함 변경도 소스에 반영했다. 이전 배포 스크립트로 되돌리면 설정 반영이 사라질 수 있다. DB 공개 포트나 새 장기 PM API 키는 만들지 않는다. 공개 HTTPS 검색정보와 미인증 거부는 확인했지만 실제 토큰의 proxy 전달·평가 timeout은 연결 후 검증한다.

2026-09-29 최초 P-Grid 매뉴얼 읽기는 Unauthorized였다. 이후 사용자가 P-Grid 읽기를 명시적으로 면제했으므로 기존 프로젝트의 백업·최소 권한·비밀 보호·별도 배포 승인 규칙을 적용한다.

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

ZIP은 **게시 대기 후보**다. MCP 서버는 활성화했지만 실제 ChatGPT 연결 검증 전이므로 현재 웹 플러그인을 교체하지 않았다. 게시 직전에 현재 release를 다시 읽고 변경 여부를 확인한 뒤 `expected_release_id`를 적용한다. 게시 후 파일 read-back 및 새 일반 Chat에서 인증·조회·합성 평가·충돌 시나리오를 확인한다.

## 운영 적용 상태와 남은 순서

1. **완료:** 자체 Better Auth 결정, 실제 활성 OWNER 1명 확인. P-Grid 읽기는 사용자 면제. client `career-chatgpt`와 사용자 제공 callback을 서버에 적용했다.
2. **완료:** 운영 DB 백업·OAuth migration·Vault 두 키 등록·최소 권한·runtime generation 게시. [서버 준비 이력](career-oauth.md#서버-준비-이력--2026-09-29)을 따른다.
3. **완료:** 앱 배포 및 비밀 아닌 CAREER 설정·Compose overlay 활성화. 다음 배포에도 유지하기 위한 CI/배포 스크립트 변경을 OAuth 호환성 수정과 함께 전달한다. [활성화 기록](evidence/career-activation-2026-09-29.json)은 활성화 당시의 상태다.
4. **일부 완료:** 공개 HTTPS discovery/JWKS 200과 미인증 MCP 401 확인. 실제 ChatGPT OWNER 확인·동의·토큰 교환·도구 호출은 남았다. 최초 실제 평가 전에 평가용 저장·외부 전송 동의가 필요하며 평가 기준 보정은 별도 작업이다.
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
