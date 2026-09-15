# 프로젝트별 회의록

각 DB 프로젝트에는 `/flows/[project]/meetings` 메뉴가 자동으로 표시된다.
회의록이 없는 프로젝트는 빈 화면을 표시한다. 상세 주소는
`/flows/[project]/meetings/[meeting]`이며 회의록과 전사본 원문을 탭으로 구분한다.

결정 사항과 태스크는 상세 화면에서 사람이 편집할 수 있다. 전사본에서 초안을 만드는
로컬 스킬과 신규 등록 도구는 `skills/sync-sum`에 있다.

## Codex·Claude Code 로컬 스킬

저장소 루트에서 설치한다. 저장소의 스킬 한 벌을 두 도구가 같은 경로로 읽도록 연결한다.
기존에 같은 이름의 다른 스킬이 있으면 교체하지 않고 중단한다.

```bash
node skills/sync-sum/scripts/install.mjs
```

- Codex: `~/.agents/skills/sync-sum` → 저장소 스킬
- Claude Code: `~/.claude/skills/sync-sum` → 같은 저장소 스킬
- Codex 호출: `$sync-sum`
- Claude Code 호출: `/sync-sum`

예: `tns 프로젝트, 회의일 2026-09-14, 제목 재고 이관 검토. 이 전사본으로 회의록 초안을 만들어줘.`
`review.md`와 검증된 `draft.json`을 만들며 전사본은 원문 그대로 포함한다.
날짜·프로젝트가 불명확하면 확인하고 기한·담당자는 임의로 정하지 않는다.
기본은 초안 생성이며 공유 DB 등록까지 요청한 경우에만 등록 절차로 진행한다.
Node 22.18 이상과 이 저장소의 의존성이 필요하다. 저장소를 옮기면 설치 링크도 갱신해야 한다.

개인 스킬 위치와 심볼릭 링크 지원은 [Codex 문서](https://learn.chatgpt.com/docs/build-skills)와
[Claude Code 문서](https://code.claude.com/docs/en/skills)를 따른다.

## 결정 사항과 태스크 편집

회의록 탭의 `결정 사항·태스크 편집`으로 항목을 추가·수정·삭제한다. 태스크의 내용,
담당자, 기한을 편집하고 `저장`으로 함께 반영한다. `취소`는 편집 내용을 버린다.
모든 항목을 삭제해 빈 목록으로 저장할 수 있지만, 빈 항목 자체는 저장하지 않는다.
요약·논의·전사본 원문은 이 편집에서 변경하지 않는다.

기존 문서 PUT API에 읽을 때의 revision을 전달한다. 다른 곳에서 먼저 수정한 경우
저장을 거절하고 입력 내용을 유지한다. 필요한 내용을 복사한 후 `편집 취소하고 최신
내용 불러오기`를 눌러 최신 회의록으로 다시 편집할 수 있다. 통신 실패도 입력을 유지한다.
이름은 화면에서 `태스크`로 표시하되 기존 JSON 키 `actionItems`는 호환성을 위해 유지한다.

## 로컬 스킬과 연결할 데이터 형식

기존 `flow_document.document`에 아래 JSON을 저장한다. `flow_project`의 프로젝트에
속한 `flow_category`(권장 slug: `meetings`) 아래에 회의당 한 문서를 둔다.
새 테이블이나 마이그레이션은 필요하지 않으며, 조회 시 DB를 변경하지 않는다.
회의 제목은 문서의 `title`, 나머지는 `content`에 담는다.

```json
{
  "slug": "meeting-2026-09-14-requirements",
  "title": "요구사항 검토 회의",
  "nodes": [],
  "edges": [],
  "content": {
    "kind": "meeting",
    "date": "2026-09-14",
    "participants": ["담당자 A", "담당자 B"],
    "summary": "요구사항 초안을 검토하고 추가 확인 항목을 정리했다.",
    "discussions": [
      { "title": "일정", "text": "자료 확인 후 일정을 확정하기로 논의했다." }
    ],
    "decisions": ["현재 초안을 기준으로 검토를 이어 간다."],
    "actionItems": [
      { "task": "자료 전달", "owner": "담당자 A", "dueDate": null }
    ],
    "transcript": "담당자 A: 자료를 확인해 전달하겠습니다.\n담당자 B: 확인 후 일정을 정하겠습니다."
  }
}
```

- `date`, `dueDate`: 실제 존재하는 `YYYY-MM-DD` 날짜. 기한 미정은 `null`.
- 담당자 미정은 `owner: null`. 전사본에 없는 담당자·기한을 추측해 넣지 않는다.
- `participants`, `discussions`, `decisions`, `actionItems`: 해당 내용이 없으면 빈 배열.
- `summary`: 요약이 없으면 빈 문자열. `transcript`는 생략 가능하다.
- 회의록과 원문은 일반 텍스트로 표시한다. HTML/스크립트를 실행하지 않는다.

등록 도구를 만들 때 `parseFlowChart`로 먼저 검증하고 프로젝트·카테고리의 소속을
확인해야 한다. 신규 생성과 수정은 구분한다. 기존 문서 수정은
`GET /api/flows/[project]/[slug]`에서 받은 revision을 사용해 기존 PUT API로 수행할 수
있다. 현재 PUT은 새 문서를 생성하지 않는다. 신규 등록은 아래 스킬 도구를 사용한다.
공유 DB의 실제 신규 등록은 읽기 전용 사전 검사와 백업을 거쳐 수행한다.

```bash
pnpm db:shared -- node skills/sync-sum/scripts/meeting.mjs inspect --file /private/output/draft.json
# 해당 결과의 등록을 승인한 경우에만 실행한다. 해시는 inspect 출력값이다.
pnpm db:shared -- node skills/sync-sum/scripts/meeting.mjs apply --file /private/output/draft.json --sha256 APPROVED_FILE_SHA256
```

검토한 파일 해시를 확인하고 대상 카테고리를 백업한 뒤 새 문서 한 건만 등록한다.
같은 slug 또는 같은 프로젝트의 동일 원문은 중복 등록하지 않는다. 기존 사람이 편집한
결정 사항·태스크를 갱신하지 않는다. 신규 회의록 카테고리가 없으면 함께 생성한다.
`prepare`와 `validate`는 DB에 연결하지 않으며 명령 인자는 도구의 `--help`를 참고한다.

목록은 제목·날짜·참석자만 조회하고 날짜 내림차순으로 표시한다. 상세에서만 선택한
회의의 본문과 원문을 읽는다. 회의 문서는 일반 차트 메뉴에서 제외하고 회의록 메뉴로
모은다. 기존 Focus AI의 빈 회의록 안내 URL도 새 목록으로 연결하며 DB 원본은 보존한다.
