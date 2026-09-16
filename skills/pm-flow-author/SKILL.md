---
name: pm-flow-author
description: 다른 프로젝트의 코드와 업무 규칙을 분석해 Project Management에 범용 화면·로직 플로우차트를 생성하거나 수정한다. pm-flow CLI로 JSON 검증, 비교, revision 조건 저장을 수행한다.
---

# 범용 플로우 작성

현재 작업 프로젝트의 코드와 사용자 결정으로 화면·로직 흐름을 작성한다. 회계 전용 스킬이 아니다.

## 도구와 대상 확인

- CLI는 `~/.local/bin/pm-flow`에 설치된다. PATH에 없으면 이 절대 경로를 쓴다.
- 다른 컴퓨터의 설치·업데이트는 작성가이드 `/guide`의 GitHub 원격 설치 절차를 따른다. 로컬 개발용은 이 SKILL.md의 실제 경로에서 저장소 루트까지 올라가 `node scripts/install-flow-tools.mjs`를 실행한다. 기존 설치 충돌은 덮어쓰지 않는다.
- `pm-flow list`로 프로젝트와 카테고리를 확인한다. 대상이 불명확하면 코드 조사와 초안을 진행하면서 대상만 질문한다.
- CLI는 현재 작업 디렉터리와 관계없이 Project Management `~/.config/pm-flow/ssh.env`의 개인 SSH 설정으로 공유 DB에 접속한다. 설정 파일이 없으면 개발 저장소의 `.env`를 사용한다. ERP 등 분석 대상 프로젝트의 구현을 바꾸는 도구가 아니다.

## 작성 순서

1. 기존 차트는 `pm-flow pull project/category/chart --out draft.json`, 신규는 `pm-flow new project/category/chart --out draft.json --title "업무 흐름"`으로 시작한다. 출력 파일이 이미 있으면 덮어쓰지 않는다.
2. 코드 근거와 사용자 결정에 따라 `chart.nodes`, `chart.edges`, 설명을 작성한다. 기존 ID와 revision은 유지한다. 새 차트의 revision은 0이다.
3. 화면 노드는 `data.role: "screen"`, `data.screen: "화면명"`을 쓴다. 배너 아래 `label` 제목과 `sections` 본문을 둔다. 로직 노드는 `role: "logic"`, screen 없이 처리 결과·실행 조건을 쓴다. 서버 작업에 가짜 화면을 만들지 않는다.
4. 본문은 `sections: [{title:"기능",lines:["..."]},{title:"확인 사항",lines:["..."]}]`를 기본으로 한다. 로직의 기능에는 검증·계산·저장을 적는다. 업무상 필요한 결과나 회계 처리는 해당 차트에서만 공통 섹션으로 추가한다.
5. 선의 `label`에는 다음 단계로 넘어가는 작업과 조건을 적는다. `kind: "impl"`은 코드로 확인한 구현, `future`는 설계, `ref`는 시간 진행이 아닌 참조다. 노드 `kind`는 색/스타일이며 role과 별개다. 새 작업은 core/future 계열을 일관되게 쓴다.
6. 분기 OR, 합류 AND, 기본값과 예외를 구별한다. 중복 생성 방지, 취소·실패 경로, 미결 조건을 확인한다. 구현·테스트·배포 검증을 혼동하지 않는다.
7. 내용만 수정할 때 `chart.layout`은 생략한다. 서버가 살아 있는 ID의 사용자 배치를 보존한다. 배치 변경 요청이 있을 때만 명시한다. 초기화는 `{nodes:{},edges:{}}`다. UI의 배치 편집에서도 조정할 수 있다.
8. `pm-flow validate draft.json`, `pm-flow diff draft.json`으로 검토한다. 사용자 요청 범위의 저장은 `pm-flow apply draft.json`으로 완료한다. 읽기 전용 요청이면 apply하지 않는다.
9. apply는 원문을 `~/.pm-backups/`에 백업·해시 검증하고 revision 조건으로 저장한다. 충돌하면 최신 문서를 새 파일로 pull하고 변경을 다시 대조한다. revision 숫자만 올려 강제 재시도하지 않는다.
10. 저장 후 새 파일로 pull해 결과를 확인한다. 변경점과 revision, 코드 검증/브라우저/배포 여부를 구별해 보고한다. 별도 요청 없는 배포·커밋·ERP 변경은 수행하지 않는다.

전체 타입은 저장소 `components/flow/types.ts`, JSON 경계는 `lib/flows/document.ts`, 작성가이드는 `/guide`다. 기존 sub/sections 차트도 지원한다. ERD·자료·회의 콘텐츠는 이 CLI 범위 밖이다.
