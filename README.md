# 프로젝트 매니지먼트

프로젝트 진행을 돕는 워크스페이스. 1단계는 **업무 플로우차트**를 그리는 것이다.

## 스택

| 목적 | 선택 |
| --- | --- |
| 프레임워크 | Next.js 16 (App Router) + TypeScript |
| 스타일 | Tailwind CSS v4 + `--bi-*` CSS 변수 토큰 |
| 그래프 렌더링 | [@xyflow/react](https://reactflow.dev) (React Flow v12) |
| 자동 레이아웃 | [@dagrejs/dagre](https://github.com/dagrejs/dagre) |
| 문서 | MDX (`@next/mdx` + `remark-gfm`) |
| 아이콘 | `react-icons` (Heroicons v1 아웃라인) |

플로우차트 구성 방식은 artisan 프로젝트의 `Web/app/docs/architecture/flow-guide`
방식을 그대로 따왔다. 핵심은 **좌표를 데이터에 넣지 않고 Dagre 에 위임**하는 것.

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:3000 → /flows 로 리다이렉트
pnpm build      # 프로덕션 빌드
pnpm typecheck  # tsc --noEmit
```

## 라우트

| 경로 | 내용 |
| --- | --- |
| `/flows` | 플로우차트 목록 |
| `/flows/[slug]` | 플로우차트 전체 화면 뷰 + 그 차트의 색 범례 |
| `/guide` | 플로우차트 작성 가이드 (MDX) |

## 디렉터리

```
app/
  globals.css            --bi-* 디자인 토큰 (색의 단일 진실 공급원)
  flows/                 목록 · 상세 라우트
  guide/page.mdx         작성 가이드
components/
  flow/
    types.ts             FlowChart · NodeKind · EdgeKind 선언 타입
    kind-style.ts        kind → 카드 스타일 표 (노드·범례 공용)
    flow-node.tsx        노드 카드 렌더
    group-node.tsx       섹션(그룹) 박스 렌더
    flow-theme.ts        엣지 색 상수 (SVG 마커는 var() 불가라 hex)
    layout.ts            Dagre 2단 좌표 계산 + 엣지 kind→스타일
    process-flow.tsx     읽기 전용 캔버스 + 전체화면 모달
    flow-legend.tsx      차트별 색 범례
  mdx/                   Callout · Steps (MDX 컴포넌트)
  shell/                 헤더 + 사이드바
lib/flows/
  registry.ts            사이드바·목록·라우트의 단일 소스
  <slug>.ts              플로우차트 데이터 ← 새 차트는 여기만 작성
```

## 새 플로우차트 추가

1. `lib/flows/<slug>.ts` 에 `FlowChart` 선언 (기존 파일 복사 권장)
2. `lib/flows/registry.ts` 의 `flowCategories` 에 등록

그 외 등록 절차는 없다. 사이드바·목록·라우트가 전부 레지스트리에서 파생된다.
자세한 규약은 `/guide` 참고.
