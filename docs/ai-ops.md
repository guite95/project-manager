# AI 세션·대화 자동 수집

`/ai-ops/activity`에서 세션/대화/검색, `/ai-ops/usage`에서 사용량을 조회한다. 기존 단일 사용자 로그인 보호를 사용한다. 이 기능은 개인 공간이며 로그인 사용자가 모두 같은 기록을 본다. 다중 사용자 서비스로 전환할 때는 기기 등록/소유자/권한부터 분리해야 한다.

## 수집 대상과 제외

Mac의 아래 기본·추가 로그 경로에 있는 Codex/Claude Code 세션을 작업 디렉터리(cwd)와 관계없이 수집한다. `~/uk`는 추가 로그 탐색 경로이며 수집 범위 제한이 아니다. cwd가 없는 기록도 세션 ID가 있으면 `(unknown)`으로 수집한다.

기본 로그 위치:
- `~/.codex/sessions`, `~/.codex/archived_sessions`
- `~/.uk-private/.codex/sessions`, `~/.uk-private/.codex/archived_sessions`
- `~/.claude/projects`, `~/.uk-private/.claude/projects`
- 설치 당시 `CODEX_HOME`, `CLAUDE_CONFIG_DIR`
- `~/uk` 하위 `.codex`, `.claude` 및 커스텀 `sessions`/`archived_sessions` 폴더

심볼릭 링크는 실제 경로로 중복 제거한다. `node_modules`, `.git`, `.next`, `.venv`, 캐시·빌드 폴더는 탐색하지 않는다. 추가 루트는 설치 설정의 `extraRoots: [{"source":"CODEX","path":"/absolute/log/root"}]`로 지정한다. 기존 `~/uk` 제한 버전에서 갱신하면 체크포인트를 한 번 초기화하여 과거에 제외한 기록도 재수집한다. 장치·세션·이벤트 ID는 유지하므로 서버에서 중복 저장하지 않는다. 프로젝트 폴더 전체나 다른 앱 데이터는 업로드하지 않는다.

사용자 메시지·공개 AI 응답·모델·시간·토큰·cwd를 수집한다. 도구 실행 본문, 시스템/개발자 메시지, 추론 본문과 알려진 자동 문맥은 제외한다. 원천이 미지원 형식으로 바뀌면 파서 업데이트가 필요하다. 비밀값 패턴은 전송 전과 서버에서 두 번 마스킹하지만, 임의의 민감한 자연어 문장까지 탐지하는 기능은 아니다. Poooling Agent는 변경하지 않으며 별도 Agent/서버로 동작한다.

## 원천별 처리

Codex 공개 대화는 `response_item.message`에서 수집한다. 같은 대화를 반복하는 `event_msg`는 중복 집계하지 않는다. 해당 형식이 없는 이전 로그만 이벤트 메시지를 읽는다. 최신 `token_usage_record`를 우선하고 기존 누적 `token_count`는 이전 값과 차이만 수집한다.

Claude Code는 user/assistant의 text만 추출하며 tool_result/tool_use/thinking은 제외한다. 토큰은 같은 모델 응답 ID를 중복 합산하지 않는다.

정규화한 차트의 입력/출력은 캐시/추론과 겹치지 않는다. 제공되지 않은 토큰은 null(미제공)이며 0과 구분한다. 일부 값이 없으면 구성 합계와 원천 전체 토큰이 다를 수 있다. 토큰은 문자 수로 추정하지 않는다.

## 설치 전 읽기 전용 검사

```bash
pnpm ai:agent scan
pnpm ai:agent scan --max-chunks 30000
```

로그를 읽고 개수만 출력한다. 본문/인증값을 출력하거나 서버로 전송하지 않으며 체크포인트도 저장하지 않는다. 기본 상한은 1000개 청크로 `limited:true`면 일부만 검사한 것이다. 변경 중인 JSONL의 마지막 미완성 줄은 다음 수집에서 읽는다. 손상·과대 줄은 오류 수로 표시한다.

## 배포 후 자동 수집 설치

1. 기존 공유 DB를 읽기 전용 확인하고 검증 가능한 백업을 만든다.
2. 승인된 커밋/푸시 후 기존 배포 워크플로로 이미지를 배포한다. 컨테이너 기동의 `prisma migrate deploy`가 새 ai_ops 테이블을 생성한다.
3. 이 Mac에서 실행한다:

```bash
pnpm ai:agent install
pnpm ai:agent status
```

기존 `~/.config/oci-ssh/config.json`의 개인 SSH 설정과 strict known-host 검증을 재사용한다. 다른 설정은 `install --ssh-config /absolute/config.json`, 다른 추가 탐색 루트는 `install --workspace /absolute/workspace`로 지정한다. 장기 API 키를 만들거나 운영 DB 비밀번호를 Mac에 복사하지 않는다.

설치는 수신 명령/테이블 존재를 읽기 전용 probe로 확인한 뒤 진행한다. 설치 후 사용자 LaunchAgent `com.project-management.ai-agent`가 로그인 시와 60초 간격으로 실행된다. 절전 중에는 실행되지 않고 Mac이 깨어나면 이어서 수집한다. 최초에는 과거 로그를 따라잡는 데 시간이 걸릴 수 있다. 별도 상주 개발 서버는 필요 없다.

- 설치/상태: `~/.local/share/pm-ai-agent/`
- 실행 설정: `~/Library/LaunchAgents/com.project-management.ai-agent.plist`
- 수동 재시도: `pnpm ai:agent sync`
- 중지: `pnpm ai:agent uninstall` (기존 데이터/체크포인트 보존)
- 업데이트: 최신 코드에서 `pnpm ai:agent install` 재실행 (기기 ID/체크포인트 유지)

수집기는 eventType/channel/synthetic/contentTypes 출처 정보만 추가로 전송한다. 텍스트로 감싼 skill 및 external-agent tool payload도 업로드 전에 분리한다. 기존 본문을 재전송으로 덮어쓰지 않는다.

동기화는 개인 SSH로 고정된 `docker exec -i project-management node scripts/ai-ops-ingest.mjs` 명령에 JSON stdin을 전달한다. 수신기는 컨테이너의 기존 DB 자격증명을 사용한다. 수신 트랜잭션 성공 ACK 후 읽은 위치를 원자적으로 저장한다. 응답이 유실되어 재전송해도 안정적 ID로 중복을 막는다. 로그/상태 파일에 대화 본문을 보관하지 않는다. 기기 화면은 마지막 서버 수신 시각·로그 루트/파일 수·오류 수를 표시한다. 연결 실패 자체는 서버에 도달할 수 없으므로 로컬 status와 서버의 지연 시각을 함께 확인한다.

## 보관·조회

소유자의 요청으로 본문·세션·메시지 메타데이터·사용량을 영구 보관한다. 수집·조회·검색에 기간 만료나 자동 삭제를 적용하지 않는다. 기존에 삭제된 본문은 원본 로그가 남아 있고 해당 이벤트를 재수집하는 경우에만 복원된다. 재수집은 동일 ID의 본문이 NULL일 때만 복원하며 기존 본문을 덮어쓰지 않는다. 수집 DB와 별도로 운영 백업의 보관 정책은 관리해야 한다.

모든 날짜 필터는 한국 시간이다. 본문 검색은 부분 문자열·FTS 키워드·의미+키워드 모드를 지원한다. 부분 문자열 모드에서 `%`, `_`는 일반 문자로 처리한다. 부분 문자열/키워드/세션/대화는 커서 페이지네이션이고 의미+키워드는 관련도 Top-K이다. 검색 인덱스와 비동기 임베딩은 [AI 검색 아키텍처](ai-search.md)를 참고한다. UI는 화면이 보일 때 15초마다 갱신한다. 인증 만료/마이그레이션 미적용/서버 오류를 빈 기록과 구분한다. AI 본문은 DB에 보관하여 전체 본문 검색을 유지한다.

## 검증과 운영 변경 경계

테스트는 `lib/test-database.ts`가 허용하는 로컬 `localhost:5432/project_management_test`만 사용한다. 공유 DB에서 테스트/초기화/`migrate dev`를 실행하지 않는다.

```bash
node --experimental-strip-types --env-file-if-exists=.env --test lib/ai-ops/*.test.mjs
pnpm typecheck
pnpm build
```

로컬 코드 구현과 운영 반영은 별도다. 배포/공유 DB migration 승인 없이 자동수집을 켜지 않는다. Docker 이미지를 이전 버전으로 되돌려도 새 테이블은 보존하고 수집 Agent는 중지한다. 테이블 삭제를 롤백 수단으로 사용하지 않는다.
