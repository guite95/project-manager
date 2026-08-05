# 플로우차트 구조 보완 — 프로젝트 계층·트리 사이드바·차트 화면 보강

- 날짜: 2026-08-05
- 상태: 설계 승인됨 (구현 전)
- 참조: https://project-flow-chart.vercel.app (ERP Flow 프로젝트 구조도 사이트)

## 배경·목표

현재 사이트는 "카테고리 → 차트" 2단 구조에 `/flows/[slug]` 상세 화면만 있다.
참조 사이트처럼 **고객사(프로젝트) 중심의 3단 계층**과 **차트를 읽는 데 필요한
맥락(소개문·브레드크럼·범례·읽는 법)** 을 화면에 함께 제공하도록 보완한다.

## 범위

포함:

1. 프로젝트 → 카테고리 → 차트 3단 트리 사이드바 (개수 배지, 접이식, 검색)
2. 차트 화면 보강: 브레드크럼, 인라인 범례 칩, "읽는 법" 불릿 섹션
3. 프로젝트 헤더: 제목 + 강조(`**...**`) 포함 소개문
4. SVG 저장 버튼

제외:

- 로그인/인증 (사용자 결정으로 제외)
- 새 차트 추가·기존 차트 내용 수정

## 데이터 모델 (`components/flow/types.ts`, `lib/flows/`)

- **`FlowProject` 신설**: `{ slug, title, intro?, categories }`. 트리 최상위 단위.
  - `intro` 는 `**강조**` 마크업을 지원하는 문자열. 데이터 파일(.ts)에 JSX 를
    넣지 않기 위해 렌더 시 간단한 `**...**` 파서로 `<strong>` 변환.
- **`FlowCategory` 에 `slug` 추가**: `cat` 쿼리파람 값으로 사용.
- **`FlowChart` 에 `howToRead?: string[]` 추가**: 차트 아래 "읽는 법" 불릿.
- **레지스트리 재편** (`lib/flows/registry.ts`): `flowCategories` → `flowProjects`.

```
공통 (common)
└─ 프로젝트 수행 (delivery)          ← deliveryLifecycle, changeControl
티앤에스 (tns)
└─ 가격표 자동 적재 (pricelist)      ← pricelistSummary, pricelistOverall, pricelistWorker
```

- 파생 헬퍼: `getProject(slug)`, `resolveChart(project, cat, chart)` (폴백 포함).
- 차트 slug 는 프로젝트 안에서만 유일하면 된다 (전역 유일 제약 제거).

## 라우팅

| 경로 | 내용 |
| --- | --- |
| `/flows` | 전체 목록 — 프로젝트 → 카테고리 섹션, 카드 링크는 쿼리파람 주소 |
| `/flows/[project]?cat=<slug>&chart=<slug>` | 프로젝트 화면 — 쿼리파람으로 차트 전환 |

- 서버 컴포넌트가 `searchParams` 를 읽어 렌더한다. 클라이언트 로직 최소화,
  `generateMetadata` 도 선택된 차트 제목/설명으로 생성.
- **폴백**: `cat`/`chart` 가 없거나 잘못되면 첫 카테고리의 첫 차트로 렌더 (404 아님).
  존재하지 않는 `[project]` 만 `notFound()`.
- 기존 `/flows/[slug]` 라우트는 제거한다 (첫 커밋 전이라 링크 호환 부담 없음).

## 사이드바 3단 트리 + 검색 (`components/shell/app-sidebar.tsx`)

- 프로젝트(개수 배지 = 소속 차트 총수) → 카테고리(개수 배지) → 차트 링크.
- 각 레벨 접이식. 현재 localStorage 접힘 상태 방식(`flows-sidebar-collapsed-v1`)을
  3단 키로 확장하고, 현재 보고 있는 차트의 조상 노드는 자동 펼침.
- 활성 판정: `usePathname` + `useSearchParams` 로 프로젝트·cat·chart 매칭.
- 상단 검색창: 차트 제목·설명 부분 일치 필터. 매칭된 차트만 트리에 남기고
  자동 펼침, 검색어 비우면 원상복귀. 클라이언트 상태만 사용 (URL 반영 안 함).

## 차트 화면 구성 (위에서 아래로)

1. **프로젝트 헤더** — 프로젝트 제목 + 소개문 (`intro`, 강조 포함)
2. **브레드크럼** — 프로젝트 › 카테고리 › 차트
3. 차트 제목 + 한 줄 설명
4. **인라인 범례 칩** — 기존 `<details>` 접이식 대신 항상 보이는 칩 나열
   (`FlowLegend` 재사용, 표시 형태만 변경)
5. **캔버스** — 상단 바: 캡션 + **SVG 저장** + 전체화면 버튼
6. **"읽는 법"** — `howToRead` 불릿 목록 (없으면 섹션 생략)

## SVG 저장

- `html-to-image` 의 `toSvg` 로 React Flow 뷰포트를 직렬화해 `<차트slug>.svg` 로
  다운로드. 노드가 HTML 카드라 순수 SVG 직렬화가 불가능하므로 React Flow 공식
  권장 방식(html-to-image)을 쓴다. 의존성 1개 추가.

## 에러 처리

- 잘못된 쿼리파람 → 첫 차트 폴백 (위 라우팅 절).
- 검색 결과 0건 → "일치하는 차트 없음" 문구.
- SVG 저장 실패 → 콘솔 에러 외 조용히 무시하지 않고 버튼 옆 짧은 실패 문구 표시.

## 검증

1. `pnpm typecheck`, `pnpm build`
2. dev 서버 + Playwright: 트리 접기/펼치기·검색 필터·차트 전환(쿼리파람)·폴백·
   SVG 저장 동작 확인
3. 확인 후 dev 서버 종료, 브라우저 닫기, 검증 산출물 삭제 (CLAUDE.md 규칙)
