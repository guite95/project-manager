import type { NodeKind } from "./types";

/* -------------------------------------------------------------------------
 * kind → 카드 스타일 표. 노드 렌더와 범례가 같은 표를 본다.
 *
 * 색은 전부 globals.css 의 --bi-* 토큰. 여기에 hex 를 새로 넣지 않는다.
 * (엣지 마커용 hex 거울은 flow-theme.ts 에 따로 있다 — SVG 속성 제약 때문.)
 * ---------------------------------------------------------------------- */

export type KindStyle = {
  /** 범례에 뜨는 이름 */
  title: string;
  /** 범례 보조 설명 */
  desc: string;
  bg: string;
  border: string;
  borderStyle: "solid" | "dashed";
  borderWidth: number;
  /** 제목 글자색 */
  fg: string;
  /** 본문 글자색 */
  subFg: string;
  /** 핸들(연결점) 색 */
  handle: string;
  /** 작은 보조 카드로 그릴지 */
  compact?: boolean;
  /** "예정" 배지를 붙일지 */
  pending?: boolean;
};

export const KIND_STYLE: Record<NodeKind, KindStyle> = {
  /* ---- 성숙도 계열 ---- */
  intake: {
    title: "진입점",
    desc: "요청·유입·트리거",
    bg: "var(--bi-card-bg)",
    border: "var(--bi-border-strong)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-border-strong)",
  },
  core: {
    title: "확정 단계",
    desc: "지금 돌고 있는 흐름",
    bg: "var(--bi-accent)",
    border: "var(--bi-accent)",
    borderStyle: "solid",
    borderWidth: 1,
    fg: "#fff",
    subFg: "rgba(255,255,255,0.78)",
    handle: "var(--bi-accent)",
  },
  future: {
    title: "예정",
    desc: "아직 미구현·미확정",
    bg: "var(--bi-accent-light)",
    border: "var(--bi-accent)",
    borderStyle: "dashed",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-border-strong)",
    pending: true,
  },
  master: {
    title: "기준정보",
    desc: "참조되는 보조 자료",
    bg: "var(--bi-card-bg)",
    border: "var(--bi-border-strong)",
    borderStyle: "dashed",
    borderWidth: 1,
    fg: "var(--bi-muted)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-border-strong)",
    compact: true,
  },

  /* ---- 도메인 계열 (아키텍처 다이어그램 8색 범례) ---- */
  entry: {
    title: "사용자·웹·진입",
    desc: "사람이 넣고 확인하는 지점",
    bg: "var(--bi-k-entry-bg)",
    border: "var(--bi-k-entry-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-entry-line)",
  },
  model: {
    title: "AI 판독·모델",
    desc: "LLM·OCR 등 확률적 판단",
    bg: "var(--bi-k-model-bg)",
    border: "var(--bi-k-model-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-model-line)",
  },
  deterministic: {
    title: "결정론 처리·조립",
    desc: "코드가 결과를 확정하는 구간",
    bg: "var(--bi-k-deterministic-bg)",
    border: "var(--bi-k-deterministic-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-deterministic-line)",
  },
  verify: {
    title: "검증·감사",
    desc: "값·커버리지·의미 대사",
    bg: "var(--bi-k-verify-bg)",
    border: "var(--bi-k-verify-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-verify-line)",
  },
  gate: {
    title: "게이트·격리·승인",
    desc: "통과 여부를 가르는 관문",
    bg: "var(--bi-k-gate-bg)",
    border: "var(--bi-k-gate-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-gate-line)",
  },
  activate: {
    title: "활성화·완료·학습",
    desc: "운영 반영과 환류",
    bg: "var(--bi-k-activate-bg)",
    border: "var(--bi-k-activate-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-activate-line)",
  },
  store: {
    title: "저장·큐·관측",
    desc: "영속 상태와 운영 지표",
    bg: "var(--bi-k-store-bg)",
    border: "var(--bi-k-store-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-store-line)",
  },
  failure: {
    title: "실패·중단·위험",
    desc: "운영 반영이 막히는 경로",
    bg: "var(--bi-k-failure-bg)",
    border: "var(--bi-k-failure-line)",
    borderStyle: "solid",
    borderWidth: 1.5,
    fg: "var(--bi-fg)",
    subFg: "var(--bi-muted)",
    handle: "var(--bi-k-failure-line)",
  },
};
