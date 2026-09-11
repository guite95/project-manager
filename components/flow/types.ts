/* -------------------------------------------------------------------------
 * 플로우차트 선언 타입.
 *
 * 설계 원칙 (artisan `/docs/architecture/flow-guide` 방식 그대로):
 *  - 좌표를 데이터에 넣지 않는다. 배치는 전부 Dagre 에 위임한다.
 *  - 데이터(노드·엣지 선언) 와 렌더(스타일) 를 분리한다.
 *    흐름이 바뀌면 배열만 고치고 스타일 코드는 건드리지 않는다.
 *  - 노드의 `kind` 는 "종류" 하나만 정한다. 시점·산출물 같은 직교 정보는
 *    배지(`timing` / `doc`)로 얹어서 색 폭발을 막는다.
 * ---------------------------------------------------------------------- */

/**
 * 성숙도 계열 — "이 단계가 지금 도는가" 를 표현한다.
 *  - `intake` : 흐름의 진입점 (요청·유입·트리거).      흰 카드 + 진한 회색 테두리
 *  - `core`   : 확정된 핵심 단계.                      accent 채움 + 흰 글자
 *  - `future` : 예정·미확정 단계.                      accent 점선 + "예정" 배지
 *  - `master` : 기준정보·참조 자료 (보조).             작은 회색 점선 카드
 */
export type MaturityKind = "intake" | "core" | "master" | "future";

/**
 * 도메인 계열 — "이 단계가 어떤 성격의 일인가" 를 표현한다.
 * 아키텍처 다이어그램처럼 단계가 많고 성격이 갈릴 때 쓴다.
 * 모두 옅은 배경 + 진한 테두리 + 검은 글자로, 서로 대등하게 보인다.
 */
export type DomainKind =
  /** 사용자·웹·진입 */
  | "entry"
  /** AI 판독·모델 */
  | "model"
  /** 결정론 처리·조립 */
  | "deterministic"
  /** 검증·감사 */
  | "verify"
  /** 게이트·격리·승인 */
  | "gate"
  /** 활성화·완료·학습 */
  | "activate"
  /** 저장·큐·관측 */
  | "store"
  /** 실패·중단·위험 */
  | "failure";

/**
 * 노드 종류. 한 차트 안에서는 한 계열만 쓰는 걸 권장한다 —
 * 성숙도 계열과 도메인 계열을 섞으면 색이 무엇을 뜻하는지 흐려진다.
 */
export type NodeKind = MaturityKind | DomainKind;

/**
 * 엣지 종류 — 선 색/점선 패턴을 결정한다.
 *  - `impl`     : 확정된 흐름.        실선 + 화살표
 *  - `ref`      : 참조·공급·환류.     점선 + 화살표
 *  - `future`   : 예정 흐름.          accent 점선 + 화살표
 *  - `snapshot` : 시점 배치·마감 흐름. 초록 점선 + 화살표
 *  - `master`   : 기준정보 참조.      회색 점선 (화살표 없음)
 */
export type EdgeKind = "impl" | "ref" | "future" | "master" | "snapshot";

export type FlowNodeData = {
  entity?: {
    domain: string;
    external: boolean;
    fieldCount: number;
    fields: { name: string; type: string; optional: boolean; keys: string[] }[];
  };
  /** 카드 제목 */
  label: string;
  /** 카드 본문. 배열이면 줄바꿈해서 여러 줄로 쌓는다. */
  sub?: string | string[];
  /** 카드 색/모양 */
  kind: NodeKind;
  /** 초록 ⏱ 배지 — 이 단계가 도는 시점 (예: "매주 월요일", "월 마감"). */
  timing?: string;
  /** 보라 📄 배지 — 이 시점에 만들어지는 산출물 (예: "요구사항 정의서"). */
  doc?: string;
};

/** 노드 선언 — 좌표 없음. id 와 데이터만. */
export type FlowNodeDef = {
  id: string;
  /** 속할 그룹 id. `FlowChart.groups` 에 선언된 id 여야 한다. */
  group?: string;
  data: FlowNodeData;
};

/** 노드를 묶는 라벨 박스. Dagre 의 compound(클러스터) 레이아웃으로 배치된다. */
export type FlowGroupDef = {
  id: string;
  label: string;
  /** 박스 테두리 색조. 생략하면 중립 회색. */
  kind?: NodeKind;
};

/** 엣지 선언 — 노드 id 로 연결. */
export type FlowEdgeDef = {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  /** 선 색을 특정 종류의 색조로 덮어쓴다. 도메인 계열 차트에서 흐름을 구분할 때. */
  tone?: NodeKind;
};

/** Dagre 배치 방향. LR = 좌→우(기본), TB = 위→아래. */
export type FlowDirection = "LR" | "TB";

/** 플로우차트 한 장. */
export type FlowChart = {
  erdDomain?: string;
  /** `chart` 쿼리파람 값 — 같은 카테고리 안에서 유일해야 한다. */
  slug: string;
  /** 화면 제목 */
  title: string;
  /** 목록 카드·사이드바에 쓰는 한 줄 설명 */
  description?: string;
  /** 캔버스 상단 바에 띄우는 보조 문구 */
  caption?: string;
  /** 차트 아래 "읽는 법" 불릿. 비우면 섹션 자체가 생략된다. */
  howToRead?: string[];
  /** 그룹 박스(그룹이 없으면 노드)를 배치하는 방향. 기본 LR. */
  direction?: FlowDirection;
  /** 그룹 **안쪽** 배치 방향. 기본은 `direction` 과 같다. */
  groupDirection?: FlowDirection;
  /** 노드 카드 폭(px). 본문이 긴 차트는 넓게 잡는다. 기본 200. */
  nodeWidth?: number;
  groups?: FlowGroupDef[];
  nodes: FlowNodeDef[];
  edges: FlowEdgeDef[];
};

/** 사이드바·목록 페이지에서 플로우차트를 묶는 단위. */
export type FlowCategory = {
  /** `cat` 쿼리파람 값 — 같은 프로젝트 안에서 유일해야 한다. */
  slug: string;
  title: string;
  charts: FlowChart[];
};

/** 트리 최상위 단위 — 고객사(또는 공통) 프로젝트. `/flows/<slug>` 라우트가 된다. */
export type FlowProject = {
  /** URL 경로 세그먼트 — `/flows/<slug>` */
  slug: string;
  title: string;
  /** 프로젝트 헤더 소개문. `**...**` 로 강조를 표시한다 (RichText 가 <strong> 으로 렌더). */
  intro?: string;
  categories: FlowCategory[];
};
