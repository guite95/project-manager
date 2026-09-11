import Dagre from "@dagrejs/dagre";
import { ENTITY_HEADER, ENTITY_ROW, ENTITY_FOOTER } from "./entity-node";
import { MarkerType, Position, type Edge, type Node } from "@xyflow/react";
import {
  BADGE_H,
  LABEL_FONT,
  LABEL_LH,
  PAD_X,
  PAD_Y,
  SUB_FONT,
  SUB_LH,
  toLines,
  type FlowRenderData,
} from "./flow-node";
import { GROUP_PAD, type GroupRenderData } from "./group-node";
import { KIND_STYLE } from "./kind-style";
import {
  EDGE_ACCENT,
  EDGE_LABEL_BG,
  EDGE_MUTED,
  EDGE_SUCCESS,
  KIND_LINE_HEX,
} from "./flow-theme";
import type {
  FlowChart,
  FlowEdgeDef,
  FlowGroupDef,
  FlowNodeData,
  FlowNodeDef,
} from "./types";

/* -------------------------------------------------------------------------
 * 선언 배열(FlowChart) → React Flow 의 nodes/edges 변환.
 *
 * 좌표는 Dagre 가 계산한다. 선언 쪽에는 좌표가 존재하지 않는다.
 * 그룹이 있으면 Dagre 의 compound(클러스터) 그래프로 배치한다.
 * ---------------------------------------------------------------------- */

const DEFAULT_NODE_W = 200;
const MASTER_W = 130;
const MASTER_H = 40;

/**
 * 글자 폭 근사. 한글·CJK 는 폰트 크기와 거의 같은 폭, ASCII 는 그 절반쯤.
 * Dagre 는 간격을 잡는 데만 쓰므로 정확할 필요는 없고 넉넉하면 된다.
 */
function visualLen(text: string): number {
  let n = 0;
  for (const ch of text) {
    n += /[ᄀ-ᇿ　-〿㄰-㆏가-힯一-鿿＀-￯]/.test(
      ch
    )
      ? 1
      : 0.55;
  }
  return n;
}

function wrapCount(text: string, boxWidth: number, fontSize: number): number {
  const perLine = Math.max(1, (boxWidth - PAD_X * 2) / fontSize);
  return Math.max(1, Math.ceil(visualLen(text) / perLine));
}

/** 카드 실제 렌더 높이 추정 — 이 값으로 Dagre 가 세로 간격을 잡는다. */
function estimateHeight(data: FlowNodeData, width: number): number {
  if (data.entity) return ENTITY_HEADER + ENTITY_ROW * data.entity.fields.length + ENTITY_FOOTER + 2;
  const style = KIND_STYLE[data.kind];
  if (style.compact) return MASTER_H;

  let h = PAD_Y * 2;
  h += wrapCount(data.label, width, LABEL_FONT) * LABEL_LH;

  const lines = toLines(data.sub);
  if (lines.length) {
    h += 3;
    for (const line of lines) h += wrapCount(line, width, SUB_FONT) * SUB_LH;
  }
  if (style.pending || data.timing || data.doc) h += 6 + BADGE_H;

  // 테두리 + 여유
  return Math.ceil(h) + 4;
}

function sizeOf(data: FlowNodeData, chartWidth: number) {
  const style = KIND_STYLE[data.kind];
  const w = style.compact ? MASTER_W : chartWidth;
  return { w, h: estimateHeight(data, w) };
}

/* --- 한 노드에 엣지가 여럿 모일 때 선이 겹쳐 달리는 문제 ---
 *
 * smoothstep 은 핸들에서 `offset` 만큼 곧게 나온 뒤 꺾는다. 기본값이 모든
 * 엣지에서 같으므로, 한 노드로 모이거나(팬인) 한 노드에서 갈라지는(팬아웃)
 * 엣지들은 **똑같은 지점에서 꺾여 같은 복도를 달린다** — 색이 달라도 위에
 * 그려진 선 하나만 보인다.
 *
 * 그래서 같은 노드를 공유하는 엣지마다 offset 을 어긋나게 준다. 꺾이는 지점이
 * 달라져 복도가 갈라지고, 마지막 핸들 근처에서만 만난다.
 */
const FAN_OFFSET_BASE = 20; // React Flow 기본값
const FAN_OFFSET_STEP = 16;

function fanOffsets(edges: FlowEdgeDef[]): Map<string, number> {
  const groups = new Map<string, string[]>();
  const push = (key: string, id: string) => {
    const list = groups.get(key);
    if (list) list.push(id);
    else groups.set(key, [id]);
  };
  for (const e of edges) {
    push(`s:${e.source}`, e.id);
    push(`t:${e.target}`, e.id);
  }

  // 한 엣지가 양 끝에서 서로 다른 순번을 받을 수 있다. 더 붐비는 쪽을 따른다.
  const rank = new Map<string, number>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.forEach((id, i) => rank.set(id, Math.max(rank.get(id) ?? 0, i)));
  }

  const out = new Map<string, number>();
  for (const e of edges) {
    out.set(e.id, FAN_OFFSET_BASE + FAN_OFFSET_STEP * (rank.get(e.id) ?? 0));
  }
  return out;
}

/** 엣지 kind → 선 색·점선·화살표 스타일. */
export function buildEdge(
  d: FlowEdgeDef,
  offset = FAN_OFFSET_BASE,
  loop = false
): Edge {
  const base = {
    id: d.id,
    source: d.source,
    target: d.target,
    // loop = 그룹 안 역방향 엣지. 기본 핸들(우→좌)로 두면 카드 중앙선 높이로
    // 되돌아가 카드 뒤에 숨으므로, 하단 우회 핸들로 갈아탄다.
    ...(loop ? { sourceHandle: "loop", targetHandle: "loop" } : {}),
    type: "smoothstep" as const,
    pathOptions: { offset },
  };

  const labelProps = (color: string) => ({
    label: d.label,
    labelStyle: { fontSize: 10, fill: color, fontWeight: 700 },
    labelBgStyle: { fill: EDGE_LABEL_BG, fillOpacity: 0.95 },
    labelBgPadding: [4, 2] as [number, number],
  });
  const arrow = (color: string, size: number) => ({
    type: MarkerType.ArrowClosed,
    color,
    width: size,
    height: size,
  });
  const tone = d.tone ? KIND_LINE_HEX[d.tone] : null;

  if (d.kind === "impl") {
    const c = tone ?? EDGE_ACCENT;
    return {
      ...base,
      ...labelProps(c),
      style: { stroke: c, strokeWidth: 1.8 },
      markerEnd: arrow(c, 16),
    };
  }

  if (d.kind === "ref") {
    const c = tone ?? EDGE_MUTED;
    return {
      ...base,
      ...labelProps(c),
      style: { stroke: c, strokeWidth: 1.5, strokeDasharray: "6 4" },
      markerEnd: arrow(c, 15),
    };
  }

  if (d.kind === "future") {
    const c = tone ?? EDGE_ACCENT;
    return {
      ...base,
      ...labelProps(c),
      style: { stroke: c, strokeWidth: 1.6, strokeDasharray: "6 4" },
      markerEnd: arrow(c, 15),
    };
  }

  if (d.kind === "snapshot") {
    const c = tone ?? EDGE_SUCCESS;
    return {
      ...base,
      ...labelProps(c),
      style: { stroke: c, strokeWidth: 1.8, strokeDasharray: "2 3" },
      markerEnd: arrow(c, 15),
    };
  }

  // master — 보조 참조선. 화살표 없이 옅게.
  return {
    ...base,
    style: {
      stroke: tone ?? EDGE_MUTED,
      strokeWidth: 1,
      strokeDasharray: "3 4",
    },
  };
}

export type LayoutResult = {
  nodes: Node<FlowRenderData | GroupRenderData>[];
  edges: Edge[];
};

/* --- 선언 오류 방어 ---
 *
 * 차트는 손으로 쓰는 선언 배열이라 오타가 난다. 특히 `group` 을 지운 뒤
 * 노드의 `group:` 을 안 지우면, 배치 계산이 없는 그룹 박스를 찾다가
 * `undefined.x` 로 터지고 **캔버스 전체가 빈 화면**이 된다. 어느 노드가
 * 문제인지도 안 나온다.
 *
 * 그래서 배치 전에 한 번 걸러낸다. 원칙은 "그릴 수 있는 만큼 그리고,
 * 버린 것은 콘솔에 이름을 대며 알린다" — 오타 하나로 그림 전체를 잃지 않는다.
 */
type SanitizedChart = {
  nodes: FlowNodeDef[];
  edges: FlowEdgeDef[];
  groups: FlowGroupDef[];
};

function sanitize(chart: FlowChart): SanitizedChart {
  const problems: string[] = [];
  const declaredGroups = new Set((chart.groups ?? []).map((g) => g.id));

  const nodes: FlowNodeDef[] = [];
  const nodeIds = new Set<string>();
  for (const n of chart.nodes) {
    if (nodeIds.has(n.id)) {
      problems.push(`노드 id "${n.id}" 가 중복이다 — 뒤엣것을 버린다`);
      continue;
    }
    nodeIds.add(n.id);
    if (n.group && !declaredGroups.has(n.group)) {
      problems.push(
        `노드 "${n.id}" 의 group "${n.group}" 이 groups 에 없다 — 그룹 밖으로 뺀다`
      );
      nodes.push({ ...n, group: undefined });
      continue;
    }
    nodes.push(n);
  }

  const edges: FlowEdgeDef[] = [];
  const edgeIds = new Set<string>();
  for (const e of chart.edges) {
    if (edgeIds.has(e.id)) {
      problems.push(`엣지 id "${e.id}" 가 중복이다 — 뒤엣것을 버린다`);
      continue;
    }
    const missing: string[] = [];
    if (!nodeIds.has(e.source)) missing.push(`source "${e.source}"`);
    if (!nodeIds.has(e.target)) missing.push(`target "${e.target}"`);
    if (missing.length) {
      problems.push(
        `엣지 "${e.id}" 의 ${missing.join(" · ")} 노드가 없다 — 이 선을 버린다`
      );
      continue;
    }
    edgeIds.add(e.id);
    edges.push(e);
  }

  // 멤버 없는 그룹은 GROUP_PAD 크기의 빈 박스로 남아 라벨만 삐져나온다.
  const groups = (chart.groups ?? []).filter((g) => {
    const used = nodes.some((n) => n.group === g.id);
    if (!used) problems.push(`그룹 "${g.id}" 에 속한 노드가 없다 — 박스를 뺀다`);
    return used;
  });

  if (problems.length) {
    console.warn(
      `[flow:${chart.slug}] 선언 오류 ${problems.length}건\n` +
        problems.map((p) => `  · ${p}`).join("\n")
    );
  }

  return { nodes, edges, groups };
}

/** Dagre 로 좌표를 계산해 React Flow 가 바로 먹을 수 있는 형태로 돌려준다. */
export function layoutChart(chart: FlowChart): LayoutResult {
  const rankdir = chart.direction ?? "LR";
  const nodeW = chart.nodeWidth ?? DEFAULT_NODE_W;

  // 이 아래로는 chart.nodes / chart.edges / chart.groups 를 직접 쓰지 않는다.
  // 걸러낸 배열만 쓴다 — 선언 오류가 배치 계산까지 흘러가지 않게.
  const { nodes, edges, groups } = sanitize(chart);
  const hasGroups = groups.length > 0;

  const innerDir = chart.groupDirection ?? rankdir;

  const size = new Map<string, { w: number; h: number }>();
  for (const n of nodes) size.set(n.id, sizeOf(n.data, nodeW));

  const groupOf = new Map<string, string>();
  for (const n of nodes) if (n.group) groupOf.set(n.id, n.group);

  /* --- 1단계: 그룹 안쪽을 각각 따로 배치한다.
   *
   * Dagre 의 compound(클러스터) 기능을 쓰지 않는 이유: 클러스터 박스는 멤버의
   * 바운딩 박스라, 멤버가 여러 rank 에 흩어지면 박스만 거대해지고 속은 빈다.
   * 안쪽을 먼저 접어서 크기를 확정하면 박스가 내용에 딱 맞는다. --- */
  const innerPos = new Map<string, { x: number; y: number }>();
  const groupSize = new Map<string, { w: number; h: number }>();

  for (const gr of groups) {
    const members = nodes.filter((n) => n.group === gr.id);
    const ig = new Dagre.graphlib.Graph();
    ig.setDefaultEdgeLabel(() => ({}));
    ig.setGraph({ rankdir: innerDir, ranksep: 70, nodesep: 34, edgesep: 20 });

    for (const m of members) {
      const s = size.get(m.id)!;
      ig.setNode(m.id, { width: s.w, height: s.h });
    }
    // 그룹 안에서 닫히는 엣지만 안쪽 배치에 반영한다.
    for (const e of edges) {
      if (groupOf.get(e.source) === gr.id && groupOf.get(e.target) === gr.id) {
        ig.setEdge(e.source, e.target);
      }
    }
    Dagre.layout(ig);

    let maxX = 0;
    let maxY = 0;
    for (const m of members) {
      const p = ig.node(m.id);
      const s = size.get(m.id)!;
      const x = p.x - s.w / 2;
      const y = p.y - s.h / 2;
      innerPos.set(m.id, { x, y });
      maxX = Math.max(maxX, x + s.w);
      maxY = Math.max(maxY, y + s.h);
    }
    groupSize.set(gr.id, {
      w: maxX + GROUP_PAD * 2,
      h: maxY + GROUP_PAD * 2,
    });
  }

  /* --- 1.5단계: 그룹 안 역방향 엣지를 카드 아래로 우회시킨다.
   *
   * LR 그룹의 뒤 노드 → 앞 노드 엣지를 기본 핸들(오른쪽 → 왼쪽)로 두면,
   * smoothstep 이 카드 중앙선 높이 그대로 왼쪽으로 되돌아간다. 노드는 엣지
   * 위에 그려지므로 그 구간 전체가 카드 몸통 뒤에 숨는다 — 나가는 스텁만
   * 보이고 어디로 가는지 안 보이는 선이 된다 (r4 · d6 이 그랬다).
   *
   * 그래서 이런 엣지는 하단 loop 핸들로 갈아타고, 그룹에서 가장 낮은 카드
   * 바닥보다 아래로 레일이 깔리도록 offset 을 계산한다. smoothstep 은
   * 같은 방향 핸들 쌍에서 `max(양끝 핸들 좌표) + offset` 에 수평 레일을
   * 만들므로 이 offset 하나로 우회 높이가 정확히 정해진다.
   * TB 그룹이면 대칭으로 오른쪽 우회. 같은 그룹에 loop 가 여러 개면
   * 레일이 겹치지 않게 칸을 어긋낸다. --- */
  const LOOP_MARGIN = 14;
  const LOOP_STAGGER = 12;
  const loopOffset = new Map<string, number>();
  const loopOut = new Set<string>();
  const loopIn = new Set<string>();
  {
    const horizontal = innerDir === "LR";
    const loopsInGroup = new Map<string, number>();
    for (const e of edges) {
      const grp = groupOf.get(e.source);
      if (!grp || groupOf.get(e.target) !== grp) continue;
      const sp = innerPos.get(e.source)!;
      const tp = innerPos.get(e.target)!;
      const ss = size.get(e.source)!;
      const ts = size.get(e.target)!;
      const isForward = horizontal
        ? sp.x + ss.w / 2 <= tp.x + ts.w / 2
        : sp.y + ss.h / 2 <= tp.y + ts.h / 2;
      if (isForward) continue;

      const bottomOf = (id: string) => {
        const p = innerPos.get(id)!;
        const s = size.get(id)!;
        return horizontal ? p.y + s.h : p.x + s.w;
      };
      const groupMax = Math.max(
        ...nodes.filter((n) => n.group === grp).map((n) => bottomOf(n.id))
      );
      const lane = loopsInGroup.get(grp) ?? 0;
      loopsInGroup.set(grp, lane + 1);
      loopOffset.set(
        e.id,
        groupMax +
          LOOP_MARGIN +
          lane * LOOP_STAGGER -
          Math.max(bottomOf(e.source), bottomOf(e.target))
      );
      loopOut.add(e.source);
      loopIn.add(e.target);
    }
  }

  /* --- 2단계: 그룹 박스와 그룹 밖 노드를 바깥 그래프로 배치한다. --- */
  /** 노드 id → 바깥 그래프에서 그 노드를 대표하는 id (그룹이면 그룹 id). */
  const outerId = (id: string) => groupOf.get(id) ?? id;

  const og = new Dagre.graphlib.Graph();
  og.setDefaultEdgeLabel(() => ({}));
  og.setGraph({
    rankdir,
    ranksep: hasGroups ? 110 : 90,
    nodesep: hasGroups ? 60 : 38,
    edgesep: 24,
    marginx: 12,
    marginy: 12,
  });

  for (const gr of groups) {
    const s = groupSize.get(gr.id)!;
    og.setNode(gr.id, { width: s.w, height: s.h });
  }
  for (const n of nodes) {
    if (n.group) continue;
    const s = size.get(n.id)!;
    og.setNode(n.id, { width: s.w, height: s.h });
  }
  // 그룹을 넘나드는 엣지만 바깥 배치에 반영한다 (중복·자기연결 제거).
  const seen = new Set<string>();
  for (const e of edges) {
    const a = outerId(e.source);
    const b = outerId(e.target);
    if (a === b) continue;
    const key = `${a}->${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    og.setEdge(a, b);
  }

  Dagre.layout(og);

  const groupBox = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >();
  for (const gr of groups) {
    const p = og.node(gr.id);
    groupBox.set(gr.id, {
      x: p.x - p.width / 2,
      y: p.y - p.height / 2,
      w: p.width,
      h: p.height,
    });
  }

  /** 노드의 최종 좌상단 좌표(절대). 그룹 밖 노드는 바깥 그래프 좌표 그대로.
   *
   * sanitize 가 "그룹 소속이면 그 박스와 안쪽 좌표가 반드시 있다"를 보장하지만,
   * 그 불변식이 깨져도 여기서 캔버스를 통째로 날리지는 않는다 — 그 노드만
   * 원점에 눕히고 나머지는 그린다. */
  const topLeft = (id: string) => {
    const s = size.get(id)!;
    const grp = groupOf.get(id);
    if (grp) {
      const box = groupBox.get(grp);
      const rel = innerPos.get(id);
      if (!box || !rel) return { x: 0, y: 0, w: s.w, h: s.h };
      return {
        x: box.x + GROUP_PAD + rel.x,
        y: box.y + GROUP_PAD + rel.y,
        w: s.w,
        h: s.h,
      };
    }
    const p = og.node(id);
    if (!p) return { x: 0, y: 0, w: s.w, h: s.h };
    return { x: p.x - s.w / 2, y: p.y - s.h / 2, w: s.w, h: s.h };
  };

  // React Flow 는 부모 노드가 자식보다 배열에서 앞에 와야 한다.
  const groupNodes: Node<GroupRenderData>[] = groups.map((gr) => {
    const b = groupBox.get(gr.id)!;
    return {
      id: gr.id,
      // 타입 이름을 "group" 으로 두면 안 된다. React Flow 기본 스타일시트의
      // `.react-flow__node-group` 규칙(padding 10px + border + background)이
      // 래퍼에 붙어서, GroupNode 가 그리는 테두리와 겹쳐 박스가 두 개로 보인다.
      type: "flowGroup",
      position: { x: b.x, y: b.y },
      data: { label: gr.label, kind: gr.kind, w: b.w, h: b.h },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: 0,
      style: { width: b.w, height: b.h },
    };
  });

  const flowNodes: Node<FlowRenderData>[] = nodes.map((n) => {
    const b = topLeft(n.id);
    const parent = hasGroups && n.group ? groupBox.get(n.group) : undefined;
    // 그룹 안 노드는 엣지 대부분이 그룹 내부에서 닫히므로 안쪽 방향에 핸들을 맞춘다.
    const dir = n.group ? innerDir : rankdir;
    const h = dir === "LR";
    return {
      id: n.id,
      type: "flow",
      // 자식 좌표는 부모 박스 기준 상대 좌표여야 한다.
      position: parent ? { x: b.x - parent.x, y: b.y - parent.y } : { x: b.x, y: b.y },
      ...(parent ? { parentId: n.group } : {}),
      data: {
        ...n.data,
        dir,
        w: b.w,
        loopOut: loopOut.has(n.id),
        loopIn: loopIn.has(n.id),
      },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: 1,
      sourcePosition: h ? Position.Right : Position.Bottom,
      targetPosition: h ? Position.Left : Position.Top,
    };
  });

  return {
    nodes: [...groupNodes, ...flowNodes],
    edges: (() => {
      const off = fanOffsets(edges);
      return edges.map((e) => {
        const edge = buildEdge(e, loopOffset.get(e.id) ?? off.get(e.id), loopOffset.has(e.id));
        if (chart.erdDomain && e.source === e.target) {
          return { ...edge, sourceHandle: "self-out", targetHandle: "self-in", pathOptions: { offset: 28 } };
        }
        if (chart.erdDomain) return { ...edge, sourceHandle: "out", targetHandle: "in" };
        return edge;
      });
    })(),
  };
}
