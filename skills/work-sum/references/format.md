# 작업 정리 형식

`collect`가 생성한 evidence JSON은 수정하지 않는다. 이 파일에는 `date`, `expectedRevision`, `projects`, `repositories`, `sources`가 있다. 요약은 별도 UTF-8 JSON 파일로 작성한다.

```json
{
  "items": [
    {
      "projectKey": "app:alpha",
      "title": "로그인 권한 검증과 예외 처리 개선",
      "sourceIds": ["git:alpha:실제커밋해시", "completion:실제완료ID"]
    }
  ],
  "excluded": [
    {"sourceId": "git:alpha:실제병합해시", "reason": "위 구현 커밋을 병합한 기록"}
  ]
}
```

- `projectKey`와 `sourceIds`는 증거 파일에 있는 값을 그대로 사용한다. 새 프로젝트 연결은 `--mapping`으로 재수집한다.
- 한 항목의 모든 증거는 같은 프로젝트여야 한다. 모든 증거는 items/excluded 전체에서 정확히 한 번 등장한다.
- 제목은 사람이 읽는 한국어 작업 결과, 최대 500자. 한 항목 안의 업무 결과가 독립적이면 분리한다.
- 완료 체크만 있는 비개발 작업도 목록에 남긴다. 미연결 저장소도 `repo:상대경로` 그룹으로 남길 수 있다.
- merge 등 제외한 자료도 근거와 사유를 저장한다. 실제 자료가 없으면 두 배열을 비운다. 수집 오류를 작업 없음으로 표현하지 않는다.
- 앱은 날짜·프로젝트·작업 목록과 접을 수 있는 증거를 보여준다. 복사에는 같은 순서의 날짜·프로젝트·작업 제목만 포함한다. 공통 프로젝트도 정리 목록에 있으면 복사한다.
