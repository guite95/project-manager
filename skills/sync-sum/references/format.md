# 출력 규약

현재 앱의 `lib/flows/document.ts`와 `lib/meetings.ts` 검증을 재사용한다.
루트의 `docs/meetings.md`가 달라졌다면 그 내용을 먼저 확인한다.

`notes.json`에는 아래 다섯 필드만 쓴다. 제목/날짜/프로젝트는 명령 인자로 전달한다.
아래는 합성 예시이며 실제 초안에서는 전사본에 근거한 내용으로 교체한다.

```json
{
  "participants": ["김담당", "이검토"],
  "summary": "현재 사용하는 품목만 이관하기로 합의했다. 과거 품목은 추가 확인이 필요하다.",
  "discussions": [
    { "title": "이관 범위", "text": "전체 품목 이관을 제안했으나 현재 사용 품목만 이번 이관에 포함하기로 합의했다." },
    { "title": "미결·추가 확인", "text": "과거 품목의 처리 방법은 다음 회의에서 확인한다." }
  ],
  "decisions": ["이번 이관은 현재 사용하는 품목만 대상으로 한다."],
  "actionItems": [
    { "task": "이관 대상 목록 전달", "owner": "김담당", "dueDate": null }
  ]
}
```

원문에 해당 내용이 없으면 배열은 `[]`, 요약은 빈 문자열로 둔다. 담당자·기한은
`null`을 사용한다. 합의된 작업 없이 담당자 지정 질문만 있으면 미결 논의다.
`tasks`, `meetingDate`, 결정 사항 객체 배열은 이 앱의 규약이 아니다.
미결/근거/검토 상태를 위해 새 JSON 필드를 임의로 추가하지 않는다.

명령 예시의 경로·slug·날짜·제목은 실제 입력에 맞게 사용한다. 실행 시에는 이 스킬의
실제 위치를 기준으로 `scripts/meeting.mjs`의 절대 경로를 사용한다.

```bash
node /path/to/sync-sum/scripts/meeting.mjs prepare \
  --project tns --slug meeting-2026-09-14-inventory \
  --date 2026-09-14 --title '재고 이관 검토' \
  --notes /private/output/notes.json --transcript /private/input/transcript.txt \
  --output /private/output/draft.json
node /path/to/sync-sum/scripts/meeting.mjs validate --file /private/output/draft.json
```

`draft.json`은 `{version: 1, projectSlug, transcriptSha256, chart}`로 생성된다.
`chart`에는 `slug`, `title`, `nodes: []`, `edges: []`, `content`가 있고,
`content`에는 notes의 다섯 필드와 `kind: "meeting"`, `date`, `transcript`가 있다.
UTF-8 원문의 BOM, CRLF, 마지막 줄바꿈까지 보존한다. 잘못된 UTF-8은 거절한다.

검토 문서의 태스크 표는 `태스크 | 담당자 | 기한 | 원문 근거`로 작성한다.
기한/담당자 미정과 해석이 필요한 표현을 명시한다. `review.md`의 근거는 검토용이며
현재 앱 화면에서는 별도 근거 링크로 렌더링되지 않는다. 형식 검사 통과가 내용 검토 완료를
뜻하지 않으므로, 전사본의 제안/합의/보류 구분을 마지막으로 직접 대조한다.
