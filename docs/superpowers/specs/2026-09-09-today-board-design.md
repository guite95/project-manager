# 오늘의 할 일 보드

- 날짜: 2026-09-09
- 상태: 설계 승인됨 (구현 전)

## 목표

프로젝트별로 쌓아둔 이슈를 하루 단위 실행 목록으로 옮겨 체크할 수 있는 화면을
만든다. 사용자는 한 페이지에서 모든 프로젝트의 이슈를 보고, 오늘 할 것을 끌어다
놓은 뒤 체크박스로 완료 표시한다.

서버·DB 없이 브라우저 `localStorage` 만으로 동작한다 (`명심할 점` 화면과 동일한
저장 방식).

## 선택한 접근

전역 페이지 `/today` 하나에 좌우 2단을 둔다. 왼쪽은 오늘의 할 일, 오른쪽은
프로젝트별로 묶인 이슈 풀이다. 항목은 **항상 한쪽에만 존재한다** — 오늘로 옮기면
풀에서 빠지고, 되돌리면 풀로 돌아온다.

검토한 다른 방식:

1. 프로젝트별 페이지(`/flows/[project]/todo`): 사이드바 트리와는 일관되지만 오늘
   할 일을 보려면 프로젝트를 오가야 한다. "여러 프로젝트의 오늘 할 일을 한 화면에서"
   라는 목적과 어긋난다.
2. 풀에 원본을 남기고 오늘 목록에는 참조를 두는 방식: 이슈 전체 목록을 항상 볼 수
   있지만 같은 항목이 두 곳에 보여 상태가 헷갈린다. 드래그 은유와도 맞지 않는다.

드래그앤드롭은 **브라우저 기본 HTML5 DnD**(`draggable` + `dataTransfer`)로
구현한다. 의존성을 늘리지 않고, 이 저장소가 `focus-trap`·`hangul-match`·
`dropdown-navigation` 을 직접 만들어 `lib`에 순수 함수로 두고 `.test.mjs` 로
검증해 온 방식과 결이 같다. 대가는 터치 드래그 미지원이며, 이는 모든 드래그
동작에 버튼 경로를 함께 두어 보완한다.

`@dnd-kit/core` 도 검토했다. 터치·키보드 드래그와 스크린리더 안내를 기본으로
주지만, 데스크톱 로컬 도구에 새 의존성을 들일 만큼의 이득은 아니라고 판단했다.

## 데이터 모델

`lib/today-board.ts` 에 타입과 순수 함수를 둔다.

```ts
type Issue = {
  id: string;
  projectSlug: string;
  title: string;
  createdAt: string; // ISO
};

type TodayItem = Issue & { done: boolean };

type TodayBoard = {
  date: string; // 로컬 기준 YYYY-MM-DD
  issues: Issue[];
  today: TodayItem[];
};
```

저장 키는 전역 하나다.

```
project-management.today-board.v1
```

프로젝트별로 키를 나누지 않는다. 보드 하나가 모든 프로젝트의 이슈를 담고,
화면에서만 `projectSlug` 로 묶어 보여준다.

`date` 는 `Intl` 이 아니라 로컬 시간 기준으로 직접 조립한 `YYYY-MM-DD` 를 쓴다
(UTC 로 계산하면 한국 시간 오전 9시 이전에 날짜가 하루 밀린다).

### 순수 함수

| 함수 | 하는 일 |
| --- | --- |
| `todayDateString(date)` | `Date` → 로컬 기준 `YYYY-MM-DD` |
| `createBoard(date)` | 빈 보드 |
| `normalizeTodayBoard(value, fallbackDate)` | 저장값 검증. 형태가 어긋난 항목과 중복 `id` 제거, 두 목록에 겹치는 `id` 는 `today` 를 남긴다 |
| `rollOverBoard(board, todayDate)` | 날짜 롤오버 (아래) |
| `addIssue(board, projectSlug, title, id, now)` | 풀에 이슈 추가. `title` 이 공백뿐이면 보드를 그대로 반환한다 |
| `removeIssue(board, issueId)` | 풀에서 이슈 삭제 |
| `sendToToday(board, issueId)` | 풀 → 오늘 목록 끝, `done: false` |
| `returnToPool(board, itemId)` | 오늘 목록 → 풀 |
| `toggleDone(board, itemId)` | 체크 토글 |

모든 함수는 입력을 변형하지 않고 새 보드를 반환한다. `id` 와 `now` 는 함수가
직접 만들지 않고 호출부가 넘긴다 — 그래야 순수 함수로 테스트할 수 있다. 컴포넌트는
`명심할 점` 과 같이 `crypto.randomUUID()` 를 쓰고 없으면 시각·난수 조합으로
대체한다.

### 날짜 롤오버

`rollOverBoard` 는 `board.date` 가 인자로 받은 오늘 날짜와 다를 때만 동작한다.

- 완료(`done: true`) 항목은 **폐기**한다. 과거 기록은 쌓지 않는다.
- 미완료(`done: false`) 항목은 **이슈 풀 뒤로 되돌린다**.
- `today` 를 비우고 `date` 를 오늘로 갱신한다.

결과적으로 오늘의 할 일은 매일 빈 상태로 시작한다.

롤오버는 **페이지를 열 때(저장값을 읽은 직후) 1회** 판정한다. 자정을 넘겨 켜둔
탭은 그 자리에서 정리되지 않고 다음에 열 때 정리된다. 타이머로 자정을 감시하지
않는다.

### 알 수 없는 프로젝트

`normalizeTodayBoard` 는 `projectSlug` 가 레지스트리에 있는지 확인하지 않는다.
레지스트리에서 프로젝트가 사라져도 이슈를 잃지 않기 위해서다. 대신 화면이
레지스트리에 없는 `projectSlug` 를 `미분류` 그룹으로 묶어 보여준다. 이 그룹은
해당 이슈가 있을 때만 나타나고, 새 이슈를 넣을 입력줄은 두지 않는다 (기존 이슈를
꺼내 쓰거나 지우기 위한 자리다).

## 화면 구조

### 라우트

| 파일 | 내용 |
| --- | --- |
| `app/today/layout.tsx` | `AppShell` 로 감싼다 (`app/flows/layout.tsx` 와 동일) |
| `app/today/page.tsx` | 서버 컴포넌트. `metadata` + `PageHeader` + 보드 |
| `components/today-board/today-board.tsx` | `"use client"` 보드 본체 |

사이드바(`components/shell/app-sidebar.tsx`) 최상단, `전체 프로젝트` 위에
`오늘의 할 일` 링크를 추가한다. 메뉴 검색어에도 걸리게 한다.

### 레이아웃

좌우 2단. 좁은 화면에서는 세로로 쌓인다.

**오른쪽 — 프로젝트 이슈**

레지스트리(`flowProjects`) 순서로 프로젝트 섹션을 만든다. 각 섹션은:

1. 프로젝트명과 이슈 개수
2. 이슈 카드 목록
3. 한 줄 입력 + `추가` 버튼

이슈 카드는 `draggable` 이며 제목, `오늘로` 버튼, 삭제 버튼을 가진다.

이슈가 하나도 없는 프로젝트 섹션도 입력줄과 함께 그대로 보여준다 (이슈를 어디에
추가해야 할지 알 수 있어야 한다).

**왼쪽 — 오늘의 할 일**

1. 오늘 날짜와 진행률 (`2/5 완료`)
2. 드롭 영역
3. 항목마다 체크박스 + 제목 + 프로젝트 배지 + `되돌리기` 버튼

완료 항목은 취소선과 `--bi-muted` 색으로 표시하되 목록에서 빼지 않는다. 하루
동안의 진행 상황이 보여야 한다.

비어 있으면 "오른쪽 이슈를 끌어다 놓으세요" 안내를 드롭 영역 안에 둔다.

### 색과 상호작용

색은 기존 `--bi-*` 토큰만 쓴다. 새 토큰을 추가하지 않는다.

드래그 중 드롭 영역은 `--bi-accent` 점선 테두리와 `--bi-accent-light` 배경으로
강조한다. 드롭 가능 여부는 `dataTransfer` 로 옮기는 데이터 종류로 판정한다
(이슈 카드가 아닌 것을 끌어와도 반응하지 않는다).

## 접근성

- 드래그로 되는 모든 동작에 버튼 경로가 있다. `오늘로` / `되돌리기` 버튼만으로
  전체 흐름을 완주할 수 있다.
- 이동·체크 결과는 `aria-live="polite"` 영역으로 알린다
  (예: "○○ 항목을 오늘의 할 일로 옮겼습니다").
- 체크박스는 네이티브 `<input type="checkbox">` 이고 `<label>` 과 연결한다.
- 삭제는 `명심할 점` 과 같이 `window.confirm` 으로 확인한다.
- `components/erp/empty-state.tsx` 는 `<tr><td>` 전용이라 여기서는 쓰지 않고
  카드용 빈 상태를 직접 만든다.

## 저장 실패 처리

`명심할 점` 과 같은 규약을 따른다. 읽기·쓰기를 `try/catch` 로 감싸고, 실패하면
보드 하단에 `--bi-error` 색 메시지를 `aria-live` 로 띄운다. 화면은 계속 동작한다.

첫 렌더에서는 저장값을 읽기 전이므로 "불러오는 중" 상태를 보여준다. 서버 렌더와
클라이언트 첫 렌더가 어긋나 하이드레이션이 깨지지 않도록 하기 위해서다.

## 검증

`lib/today-board.test.mjs` (`node --test lib/today-board.test.mjs`):

1. 롤오버 — 날짜가 다르면 완료 항목은 사라지고 미완료 항목은 풀로 돌아온다
2. 롤오버 — 날짜가 같으면 아무것도 바뀌지 않는다
3. `sendToToday` / `returnToPool` 왕복 후 항목이 한쪽에만 존재한다
4. `normalizeTodayBoard` 가 깨진 값, 중복 `id`, 두 목록에 겹치는 `id` 를 정리한다
5. `todayDateString` 이 로컬 기준으로 날짜를 만든다
6. `toggleDone` 이 대상 항목만 바꾼다

그 외:

- `pnpm typecheck`
- 브라우저에서 드래그·버튼·체크·삭제·새로고침 후 유지 확인

## 범위 밖

- 목록 안에서 순서 바꾸는 드래그
- 우선순위·마감일·메모 필드
- 과거 날짜 히스토리
- 터치 드래그
- 기존 `명심할 점` 데이터와의 연동
