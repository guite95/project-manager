# 실행 및 설치

Node 22.18 이상, project-management 의존성 설치가 필요하다. 스킬 폴더만 복사하면 실행되지 않는다. 개인 설치는 저장소를 가리키는 링크다.

```sh
node skills/work-sum/scripts/install.mjs
```

Codex: `$work-sum 오늘 작업 정리해줘` / Claude: `/work-sum 오늘 작업 정리해줘`

저장소 루트에서 아래 순서로 실행한다. /tmp 파일명은 매번 새 임시 디렉터리를 만들어 사용한다. 산출물은 저장 확인 후 정리한다.

```sh
pnpm db:shared -- node skills/work-sum/scripts/work.mjs projects
pnpm db:shared -- node skills/work-sum/scripts/work.mjs collect --output /tmp/work-sum-UNIQUE/evidence.json
node skills/work-sum/scripts/work.mjs validate --evidence /tmp/work-sum-UNIQUE/evidence.json --file /tmp/work-sum-UNIQUE/draft.json
pnpm db:shared -- node skills/work-sum/scripts/work.mjs save --evidence /tmp/work-sum-UNIQUE/evidence.json --file /tmp/work-sum-UNIQUE/draft.json --sha256 VALIDATE에서_받은_해시
```

`collect --date YYYY-MM-DD --root PATH --authors EMAIL,EMAIL --mapping FILE --ai-mapping FILE` 옵션. 기본은 오늘, ~/Documents/project, 저장소별 user.email이다. 여러 이메일을 지정하면 모든 저장소에 적용한다. 미커밋 변경, reflog만 남은 커밋, 원격에서 아직 가져오지 않은 변경은 수집하지 않는다. fetch/pull은 수행하지 않는다. 모든 로컬 ref와 HEAD를 검사한다. 추가 워크트리는 같은 저장소로 중복 집계하지 않는다. 오류·작성자 미설정은 evidence.repositories에 남는다.

AI 메시지도 기본으로 함께 수집한다. 반환되는 `aiTranscript` (`출력파일.ai.json`)는 0600 권한의 검토용 대화 전문이며 evidence와 분리된다. evidence에는 메시지 ID·세션 ID·역할·시각·cwd·본문 유무와 기기 수신 상태가 남는다. 저장 결과를 확인한 뒤 두 파일과 초안을 정리한다. 초안만 요청했거나 저장을 못한 경우에는 검토/재개할 파일을 보존하고 위치를 알려준다. 전문을 리포에 넣지 않는다. AI 조회 실패·테이블 누락은 수집 실패이며 0건으로 대체하지 않는다. 당일 20,000개 메시지 또는 evidence 10MB 한도를 넘으면 잘라내지 않고 실패한다.

Git 루트는 AI 조회 범위를 제한하지 않는다. `--ai-mapping` 예: `{"/Users/me/uk/youtube-sync":"personal-youtube-sync"}`. DB의 실제 cwd와 `projects` 결과를 확인하고 사용자가 제공한 연결만 지정한다. 기본은 Git 수집 저장소의 가장 가까운 상위 경로를 사용하며 나머지는 `ai-cwd:` 독립 그룹이다. `--authors`는 Git에만 적용된다.

매핑 파일 예: `{"tns/tnstrading":"tns"}`. 실제 `projects` 결과와 저장소 상대 경로를 확인해 작성한다. 미연결 자료를 임의 연결하지 않는다.

DB 명령은 기존 공유 DB 래퍼를 사용한다. 직접 연결은 안전 검증한 로컬 project_management_test만 허용한다. 공유 DB 테스트·마이그레이션은 필요하지 않다. app_setting의 work-summary:YYYY-MM-DD에 한 날짜의 최신 스냅샷을 저장한다. 다시 저장할 때 이전 값은 기본 ~/pm-backups에 해시를 검증한 0600 백업으로 남긴다. 완료/이슈 원본은 수정하지 않는다.

`save` 성공은 DB 저장을 뜻한다. 배포된 앱에 이 UI 코드가 반영됐다는 뜻은 아니다.
