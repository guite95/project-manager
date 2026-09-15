# 프로젝트 등록

준비된 초안은 앱의 기존 JSONB 저장소에 신규 문서로 추가한다. 현재 일반 PUT API는
신규 생성을 지원하지 않으므로 등록 스크립트를 사용한다. 이 스크립트는 기존 회의록을
갱신하지 않으며 같은 slug 또는 같은 프로젝트의 동일 전사본을 발견하면 중단한다.
재생성으로 사람의 수정 내용을 덮어쓰지 않는다.

저장소 루트에서 기존 `pnpm db:shared`를 사용한다. 서버 접속 설정을 이 스킬에 복사하지
않는다. 래퍼는 개인 SSH 인증·known-host 검증을 사용하고 서버 DB 자격증명을 메모리에서만
전달한다. 래퍼가 닫힐 때 자신이 연 터널도 정리한다. DB URL을 출력하지 않는다.

```bash
pnpm db:shared -- node skills/sync-sum/scripts/meeting.mjs projects
pnpm db:shared -- node skills/sync-sum/scripts/meeting.mjs inspect --file /private/output/draft.json
```

사전 검사 결과의 프로젝트 이름·slug, 중복 여부, 초안 SHA-256과 검토 문서를 확인한다.
`canApply: false`이면 원인을 해결한다. 중복을 피하려고 slug만 바꿔 재등록하지 않는다.
프로젝트가 없으면 자동 생성하지 않고 어떤 프로젝트인지 확인한다.

사용자가 이 결과의 등록까지 승인했을 때 검사에서 받은 해시를 전달한다. 이미 승인한
등록에는 반복 확인이 필요 없다. 준비된 결과를 아직 승인하지 않았다면 검토 문서와
대상 프로젝트를 먼저 제시하고 등록 여부를 묻는다.

```bash
pnpm db:shared -- node skills/sync-sum/scripts/meeting.mjs apply \
  --file /private/output/draft.json --sha256 INSPECT에서_받은_실제_SHA256
```

등록 도구는 대상 프로젝트/회의록 카테고리의 기존 상태를 `~/pm-backups`에 백업하고
파일 해시를 재검증한다. 트랜잭션 안에서 중복을 다시 검사하고 필요한 `meetings`
카테고리와 문서 한 건만 추가한다. 저장 JSON 일치와 revision, 상세 경로를 반환한다.
스키마 변경·마이그레이션·배포·서버 재시작은 수행하지 않는다.

성공하면 상세 경로와 백업 경로를 보고한다. 오류 후에는 `inspect`로 실제 상태를
확인하며, 이미 생성됐다면 다시 등록하지 않는다. 웹 화면 확인은 실제로 열어 본 경우에만
통과라고 보고한다. 스킬 설치만으로 원격 앱 코드가 배포되지는 않는다.

테스트는 `lib/test-database.ts`로 보호된 로컬 `project_management_test`만 사용한다.
공유 DB에서 테스트를 실행하거나 `migrate dev`, `db push`, reset을 하지 않는다.
