"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { KIND_STYLE } from "./kind-style";
import type { FlowDirection, FlowNodeData } from "./types";

/**
 * 렌더 시점에만 쓰는 노드 데이터. 선언(`FlowNodeData`)에 배치 방향·폭을 넣지
 * 않기 위해, layoutChart() 가 계산한 값을 여기서 덧붙인다. 커스텀 노드는
 * `sourcePosition`/`targetPosition` 을 무시하고 `<Handle position>` 을 따르므로
 * 핸들 위치를 직접 정해줘야 한다.
 */
export type FlowRenderData = FlowNodeData & {
  dir: FlowDirection;
  w: number;
  /** 그룹 안 역방향(loop) 엣지가 이 노드에서 나가거나/들어온다 — 우회 핸들을 단다. */
  loopOut?: boolean;
  loopIn?: boolean;
};

export const LABEL_FONT = 12.5;
export const SUB_FONT = 10.5;
export const LABEL_LH = 17;
export const SUB_LH = 14;
export const PAD_X = 13;
export const PAD_Y = 9;
export const BADGE_H = 16;

export function toLines(sub: FlowNodeData["sub"]): string[] {
  if (!sub) return [];
  return Array.isArray(sub) ? sub : [sub];
}

export function FlowNode({ data }: NodeProps<Node<FlowRenderData>>) {
  const s = KIND_STYLE[data.kind];
  const horizontal = data.dir === "LR";
  const lines = toLines(data.sub);
  const compact = s.compact === true;

  const handleStyle = {
    background: s.handle,
    width: 6,
    height: 6,
    border: "none",
  };

  return (
    <div
      style={{
        width: data.w,
        padding: compact ? "6px 12px" : `${PAD_Y}px ${PAD_X}px`,
        borderRadius: 2,
        backgroundColor: s.bg,
        border: `${s.borderWidth}px ${s.borderStyle} ${s.border}`,
        color: s.fg,
      }}
    >
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        style={handleStyle}
      />
      {data.loopIn ? (
        <Handle
          type="target"
          id="loop"
          position={horizontal ? Position.Bottom : Position.Right}
          style={handleStyle}
        />
      ) : null}

      <div
        style={{
          fontSize: compact ? 11 : LABEL_FONT,
          fontWeight: 700,
          color: s.fg,
          lineHeight: `${LABEL_LH}px`,
        }}
      >
        {data.label}
      </div>

      {lines.length ? (
        <div style={{ marginTop: 3 }}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: SUB_FONT,
                color: s.subFg,
                lineHeight: `${SUB_LH}px`,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {s.pending || data.timing || data.doc ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {s.pending ? <Badge bg="var(--bi-accent)">예정</Badge> : null}
          {data.timing ? (
            <Badge bg="var(--bi-success)">⏱ {data.timing}</Badge>
          ) : null}
          {data.doc ? <Badge bg="var(--bi-doc)">📄 {data.doc}</Badge> : null}
        </div>
      ) : null}

      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        style={handleStyle}
      />
      {data.loopOut ? (
        <Handle
          type="source"
          id="loop"
          position={horizontal ? Position.Bottom : Position.Right}
          style={handleStyle}
        />
      ) : null}
    </div>
  );
}

function Badge({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: "#fff",
        backgroundColor: bg,
        padding: "1px 6px",
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
