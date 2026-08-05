import type { NodeKind } from "./types";

/* -------------------------------------------------------------------------
 * 엣지 전용 색 상수.
 *
 * 노드 카드는 인라인 `style` 로 그리므로 `var(--bi-*)` 를 그대로 쓸 수 있지만,
 * 엣지의 화살표 마커는 React Flow 가 SVG **속성**(`fill`/`stroke`)으로 내보낸다.
 * SVG 표현 속성 값에서는 `var()` 가 해석되지 않으므로 여기서는 hex 를 쓴다.
 *
 * 아래 값은 globals.css 토큰의 거울이다. 토큰을 바꾸면 여기도 같이 바꾼다.
 * ---------------------------------------------------------------------- */

/** = --bi-accent */
export const EDGE_ACCENT = "#1b2a4a";
/** = --bi-success */
export const EDGE_SUCCESS = "#10b981";
/** = --bi-edge-muted */
export const EDGE_MUTED = "#c4c4c4";
/** = --bi-bg (엣지 라벨 배경) */
export const EDGE_LABEL_BG = "#ffffff";

/** kind 별 선 색. `FlowEdgeDef.tone` 으로 엣지 색을 지정할 때 쓴다. */
export const KIND_LINE_HEX: Record<NodeKind, string> = {
  intake: "#d4d4d4", // --bi-border-strong
  core: EDGE_ACCENT,
  future: EDGE_ACCENT,
  master: EDGE_MUTED,
  entry: "#1971c2", // --bi-k-entry-line
  model: "#7048e8", // --bi-k-model-line
  deterministic: "#0f766e", // --bi-k-deterministic-line
  verify: "#b7791f", // --bi-k-verify-line
  gate: "#c2410c", // --bi-k-gate-line
  activate: "#2f9e44", // --bi-k-activate-line
  store: "#495057", // --bi-k-store-line
  failure: "#c92a2a", // --bi-k-failure-line
};
