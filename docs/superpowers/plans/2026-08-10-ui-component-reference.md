# 전체 프로젝트 UI 컴포넌트 레퍼런스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FocusAI `dev/ui`의 모든 레퍼런스 요소를 현재 프로젝트 색상 토큰에 맞춰 `/flows`의 “전체 프로젝트” 안에서 백엔드 없이 동작하게 만든다.

**Architecture:** `/flows` 서버 페이지가 `view` 쿼리를 정규화해 프로젝트 목록 또는 클라이언트 UI 갤러리를 선택한다. 재사용 가능한 업무 UI는 `components/erp`, 예시 데이터와 섹션 조합은 `components/ui-reference`, URL·컬럼 설정 정규화는 테스트 가능한 순수 모듈 `lib/ui-reference`에 둔다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, Node `node:test`, browser `localStorage`

## Global Constraints

- 기존 `components/shell/app-sidebar.tsx`, `lib/flows/registry.ts`, `lib/flows/pricelist-human-review*`, `lib/navigation/*`의 사용자 변경을 되돌리거나 함께 커밋하지 않는다.
- FocusAI의 `--demo-*` 대신 현재 프로젝트의 `--bi-*` 토큰만 사용한다.
- API, DB, TanStack Query, 인증, 고객 데이터와 네트워크 요청을 추가하지 않는다.
- 공통 컴포넌트는 12px 본문, 11px 보조 글자, 0~4px radius, 1px 경계선, 무그림자 원칙을 유지한다.
- 관리형 테이블 설정은 `localStorage` 실패 시 메모리 상태로 계속 동작하고 손상된 값은 기본값으로 복구한다.
- 모달은 ESC·배경 닫기·포커스 순환 및 복원·배경 스크롤 잠금을 지원한다.
- 구현 순서는 각 작업의 RED → GREEN → 검증 → 커밋을 바꾸거나 생략하지 않는다.

---

### Task 1: 전체 프로젝트 탭 라우팅

**Files:**
- Create: `lib/ui-reference/view.ts`
- Create: `lib/ui-reference/view.test.mjs`
- Modify: `app/flows/page.tsx`
- Modify: `components/shell/app-sidebar.tsx`

**Interfaces:**
- Produces: `type FlowsView = "projects" | "components"`
- Produces: `resolveFlowsView(value: string | string[] | undefined): FlowsView`
- Produces: `/flows?view=components` 링크와 `/flows` 기본 프로젝트 뷰

- [ ] **Step 1: 쿼리 정규화 실패 테스트 작성**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { resolveFlowsView } from "./view.ts";

test("components만 UI 레퍼런스 뷰로 허용한다", () => {
  assert.equal(resolveFlowsView("components"), "components");
  assert.equal(resolveFlowsView(undefined), "projects");
  assert.equal(resolveFlowsView("unknown"), "projects");
  assert.equal(resolveFlowsView(["components"]), "projects");
});
```

- [ ] **Step 2: RED 확인**

Run: `node --test lib/ui-reference/view.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `view.ts`.

- [ ] **Step 3: 최소 정규화 구현**

```ts
export type FlowsView = "projects" | "components";

export function resolveFlowsView(
  value: string | string[] | undefined,
): FlowsView {
  return value === "components" ? "components" : "projects";
}
```

`app/flows/page.tsx`는 `searchParams: Promise<{ view?: string | string[] }>`를 받아
`resolveFlowsView`로 분기한다. 제목을 `전체 프로젝트`로 바꾸고 `프로젝트`와
`UI 컴포넌트` 링크 탭을 제목 아래에 렌더한다. 프로젝트 뷰의 기존 카드 마크업은
별도 `ProjectsOverview` 함수로 옮기되 내용은 변경하지 않는다.

`components/shell/app-sidebar.tsx`에서는 `/flows` 링크 텍스트만
`전체 플로우차트`에서 `전체 프로젝트`로 바꾼다.

- [ ] **Step 4: GREEN과 타입 검사**

Run: `node --test lib/ui-reference/view.test.mjs && pnpm typecheck`
Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: 작업 범위 커밋**

```bash
git add lib/ui-reference/view.ts lib/ui-reference/view.test.mjs app/flows/page.tsx
git commit -m "feat: 전체 프로젝트 뷰 탭 추가"
```

사이드바는 기존 사용자 변경과 같은 파일에 있으므로 이 커밋에 통째로 포함하지
않고 최종 상태만 유지한다.

### Task 2: 공통 UI 프리미티브와 정적 레퍼런스

**Files:**
- Create: `components/erp/cn.ts`
- Create: `components/erp/button.tsx`
- Create: `components/erp/badge.tsx`
- Create: `components/erp/detail-section.tsx`
- Create: `components/erp/empty-state.tsx`
- Create: `components/erp/data-table.tsx`
- Create: `components/erp/page-header.tsx`
- Create: `components/ui-reference/static-sections.tsx`
- Create: `components/ui-reference/ui-reference-gallery.tsx`
- Modify: `app/flows/page.tsx`

**Interfaces:**
- Produces: `Button`, `Badge`, `DetailSection`, `EmptyState`, `DataTable<Row>`, `PageHeader`
- Produces: `UiReferenceGallery`
- Consumes: Task 1의 `FlowsView` 분기

- [ ] **Step 1: 갤러리 연결 RED 확인**

`app/flows/page.tsx`의 components 분기에 아래 import와 렌더를 먼저 추가한다.

```tsx
import { UiReferenceGallery } from "@/components/ui-reference/ui-reference-gallery";

return view === "components" ? <UiReferenceGallery /> : <ProjectsOverview />;
```

Run: `pnpm typecheck`
Expected: FAIL with module not found for `ui-reference-gallery`.

- [ ] **Step 2: FocusAI 프리미티브 최소 이식**

`cn(...values)`는 falsy 값을 제외해 className을 결합한다. 각 컴포넌트의 props와
variant는 FocusAI 레퍼런스와 동일하게 유지하되 모든 토큰을 다음처럼 치환한다.

```ts
const VARIANTS = {
  primary: "bg-[var(--bi-accent)] text-white",
  secondary: "border border-[var(--bi-border)] bg-[var(--bi-bg)] text-[var(--bi-fg)]",
  ghost: "bg-transparent text-[var(--bi-accent)]",
  destructive: "bg-[var(--bi-error)] text-white",
} as const;
```

`DataTableColumn<Row>`는 `{ key, header, align?, render }`를 제공하고, 빈 rows는
caption과 동일한 semantic table 안에서 `EmptyState`로 표시한다.

- [ ] **Step 3: 정적 섹션 구현**

`static-sections.tsx`에 `TokensSection`, `TypographySection`, `ButtonsSection`,
`BadgesSection`을 구현한다. 토큰 목록은 `--bi-accent`, `--bi-accent-light`,
`--bi-bg`, `--bi-fg`, `--bi-muted`, `--bi-border`, `--bi-sidebar-bg`,
`--bi-success`, `--bi-warning`, `--bi-error` 순서다.

`UiReferenceGallery`는 `PageHeader` 뒤에 1~8번 섹션을 순서대로 조합하며 이 단계에는
구현된 정적 섹션만 연결한다.

- [ ] **Step 4: GREEN과 빌드 확인**

Run: `pnpm typecheck && pnpm build`
Expected: both exit 0; `/flows?view=components` compiles.

- [ ] **Step 5: 커밋**

```bash
git add components/erp components/ui-reference app/flows/page.tsx
git commit -m "feat: UI 레퍼런스 공통 프리미티브 추가"
```

### Task 3: 검색형 폼과 필터 테이블

**Files:**
- Create: `components/erp/hangul-match.ts`
- Create: `components/erp/hangul-match.test.mjs`
- Create: `components/erp/dropdown.tsx`
- Create: `components/erp/form-field.tsx`
- Create: `components/erp/form-layout.tsx`
- Create: `components/erp/filter-bar.tsx`
- Create: `components/erp/select.tsx`
- Create: `components/ui-reference/forms-section.tsx`
- Create: `components/ui-reference/table-filter-section.tsx`
- Modify: `components/ui-reference/ui-reference-gallery.tsx`

**Interfaces:**
- Produces: `hangulIncludes(value: string, query: string): boolean`
- Produces: `Dropdown`, `TextField`, `SelectField`, `CheckboxField`, `FormGrid`, `FormActions`, `FilterBar`, `Select`
- Consumes: Task 2의 `Button`, `DetailSection`, `DataTable`

- [ ] **Step 1: 한글 검색 RED 테스트 작성**

```js
test("문자열과 초성 검색을 모두 지원한다", () => {
  assert.equal(hangulIncludes("대한민국", "대한"), true);
  assert.equal(hangulIncludes("대한민국", "ㄷㅎ"), true);
  assert.equal(hangulIncludes("대한민국", "ㅁㄱ"), true);
  assert.equal(hangulIncludes("대한민국", "ㅅㅇ"), false);
});
```

Run: `node --test components/erp/hangul-match.test.mjs`
Expected: FAIL because `hangul-match.ts` does not exist.

- [ ] **Step 2: 한글 검색 GREEN 구현**

한글 음절의 초성 인덱스를 `(codePoint - 0xac00) / 588`로 계산하고 일반 문자열은
소문자 부분 일치로 처리한다. 초성 query이면 대상 문자열의 초성 문자열에 대해
부분 일치를 수행한다.

Run: `node --test components/erp/hangul-match.test.mjs`
Expected: PASS.

- [ ] **Step 3: 접근 가능한 검색형 Dropdown과 폼 구현**

`Dropdown`은 trigger button, `role="listbox"`, `role="option"`, 검색 input,
바깥 클릭·ESC 닫기와 arrow/enter 키 선택을 제공한다. `SelectField searchable`이
이 컴포넌트를 사용한다. `FormsSection`은 FocusAI와 같은 일반 select, 국가 검색형
select, 텍스트 필드, 체크박스와 취소·저장 버튼을 로컬 상태로 렌더한다.

- [ ] **Step 4: 실제 필터링 테이블 구현**

`TableFilterSection`은 검색어가 code 또는 name에 포함되고 status 선택값이 맞는
행만 `DataTable`에 전달한다. 빈 결과와 별도 빈 상태 샘플을 모두 표시한다.

- [ ] **Step 5: 통합 검증과 커밋**

Run: `node --test components/erp/hangul-match.test.mjs && pnpm typecheck && pnpm build`
Expected: all commands exit 0.

```bash
git add components/erp components/ui-reference
git commit -m "feat: 로컬 폼과 필터 레퍼런스 추가"
```

### Task 4: 로컬 관리형 테이블

**Files:**
- Create: `lib/ui-reference/table-preferences.ts`
- Create: `lib/ui-reference/table-preferences.test.mjs`
- Create: `components/erp/column-settings-popover.tsx`
- Create: `components/erp/use-managed-columns.ts`
- Create: `components/ui-reference/managed-table-section.tsx`
- Modify: `components/erp/data-table.tsx`
- Modify: `components/ui-reference/ui-reference-gallery.tsx`

**Interfaces:**
- Produces: `ColumnDefinition`, `TablePreferences`, `normalizeTablePreferences(columns, stored)`
- Produces: `useManagedColumns<Row>(storageKey, columns)` returning `prefs`, `visibleColumns`, `columnWidths`, `toggle`, `move`, `startResize`, `reset`
- Produces: `ColumnSettingsPopover`

- [ ] **Step 1: 손상 설정 복구 RED 테스트 작성**

```js
test("손상되거나 오래된 컬럼 설정을 현재 기본값으로 정규화한다", () => {
  assert.deepEqual(
    normalizeTablePreferences(COLUMNS, {
      order: ["name", "missing", "name"],
      hidden: ["code", "missing"],
      widths: { name: 9999, code: 12, missing: 100 },
    }),
    {
      order: ["name", "code", "qty"],
      hidden: ["code"],
      widths: { name: 480, code: 60, qty: 90 },
    },
  );
});
```

Run: `node --test lib/ui-reference/table-preferences.test.mjs`
Expected: FAIL because module is missing.

- [ ] **Step 2: 정규화 GREEN 구현**

컬럼 정의는 `key`, `label`, `defaultVisible`, `defaultWidth`, `minWidth`,
`maxWidth`를 가진다. 정규화는 중복·미등록 key를 제거하고 빠진 key를 기본
순서로 붙이며, width를 각 컬럼 min/max 안으로 clamp한다.

Run: `node --test lib/ui-reference/table-preferences.test.mjs`
Expected: PASS.

- [ ] **Step 3: localStorage hook과 컬럼 설정 팝오버 구현**

hook은 mount 후 저장값을 parse·정규화하고 변경마다 try/catch 안에서 저장한다.
팝오버는 표시 checkbox, 위·아래 이동 버튼, 초기화 버튼을 제공한다. 순서 변경은
키보드 버튼으로 항상 가능하며 포인터 drag는 같은 `move` 함수를 사용한다.

- [ ] **Step 4: 너비 조절과 관리형 샘플 연결**

`DataTable`에 `colgroup`, 최소 table width와 header resize handle을 추가한다.
`ManagedTableSection`은 거래처 샘플 2행, 컬럼 설정 팝오버, 표시·순서·너비 변경과
새로고침 유지 동작을 연결한다.

- [ ] **Step 5: 검증과 커밋**

Run: `node --test lib/ui-reference/table-preferences.test.mjs && pnpm typecheck && pnpm build`
Expected: all commands exit 0.

```bash
git add lib/ui-reference components/erp components/ui-reference
git commit -m "feat: 로컬 관리형 테이블 레퍼런스 추가"
```

### Task 5: 접근 가능한 상세 모달

**Files:**
- Create: `components/erp/detail-modal.tsx`
- Create: `components/ui-reference/modal-demo-section.tsx`
- Modify: `components/ui-reference/ui-reference-gallery.tsx`

**Interfaces:**
- Produces: `DetailModal`, `DetailRail`, `DetailTabBar`, `PanelSection`, `RailEditGroup`, `RailEditRow`, `RailGroup`, `RailMetric`, `RailPairs`, `DetailTab<Key>`
- Consumes: Task 2의 `Button`, Task 3의 `Select`

- [ ] **Step 1: 연결 RED 확인**

`UiReferenceGallery`에 `<ModalDemoSection />`을 import·렌더한다.

Run: `pnpm typecheck`
Expected: FAIL with module not found for `modal-demo-section`.

- [ ] **Step 2: 모달 셸과 포커스 관리 구현**

열릴 때 이전 activeElement를 저장하고 body overflow를 잠근다. 첫 focusable 요소에
포커스하며 Tab/Shift+Tab을 dialog 안에서 순환시킨다. ESC와 왼쪽 mouse button의
배경 클릭만 닫고 cleanup에서 body overflow와 이전 포커스를 복구한다.

- [ ] **Step 3: 레일·탭·패널과 로컬 인라인 편집 구현**

FocusAI 예시의 주문·배정, 출고, 해피콜, 시공완료, 수금, 이력 탭과 좌측 요약 레일을
이식한다. 인수자 빈 값은 `인수자를 입력하세요.` 오류를 표시하고 나머지 저장은
350ms 로컬 Promise 뒤 상태를 갱신한다.

- [ ] **Step 4: 타입·빌드 검증과 커밋**

Run: `pnpm typecheck && pnpm build`
Expected: both exit 0.

```bash
git add components/erp/detail-modal.tsx components/ui-reference
git commit -m "feat: 상세 모달 레퍼런스 추가"
```

### Task 6: 전체 회귀와 브라우저 검증

**Files:**
- Modify only if verification exposes a defect in files created or intentionally changed above.

**Interfaces:**
- Consumes: Tasks 1–5의 전체 UI 레퍼런스
- Produces: 검증된 `/flows` 프로젝트 뷰와 `/flows?view=components` UI 뷰

- [ ] **Step 1: 자동 검증 실행**

Run:

```bash
node --test lib/ui-reference/view.test.mjs
node --test components/erp/hangul-match.test.mjs
node --test lib/ui-reference/table-preferences.test.mjs
pnpm typecheck
pnpm build
```

Expected: every command exits 0.

- [ ] **Step 2: 서버 소유권 확인 후 브라우저 검증**

`lsof -nP -iTCP:30001 -sTCP:LISTEN`으로 기존 서버를 확인한다. 없을 때만 `pnpm dev`를
시작하고 작업 종료 시 그 프로세스만 내린다. 기존 서버가 있으면 그대로 사용하고
종료하지 않는다.

브라우저에서 프로젝트/UI 탭, 직접 URL, 일반·초성 검색형 선택, 실제 행 필터,
컬럼 숨김·순서·너비·새로고침 유지, 모달 탭·인라인 편집·ESC·배경 닫기·포커스
복원을 확인한다. 프로젝트 카드, 사이드바 검색·접기·펼치기와 기존 상세 이동도
회귀 확인한다.

- [ ] **Step 3: 흔적 정리와 변경 범위 확인**

검증용 `*.png`, `*.yml`, `*.yaml`이 생성됐으면 삭제한다. `git status --short`와
`git diff --check`를 실행해 기존 사용자 변경과 이번 구현을 구분한다.

- [ ] **Step 4: 최종 구현 커밋**

사이드바의 한 줄 변경이 기존 사용자 hunk와 분리해 안전하게 stage 가능할 때만
이번 구현 커밋에 포함한다. 분리할 수 없으면 워킹트리에 유지하고 완료 보고에서
명시한다. 커밋 메시지에는 Co-Authored-By 트레일러를 넣지 않는다.

```bash
git commit -m "feat: 전체 프로젝트 UI 레퍼런스 완성"
```

