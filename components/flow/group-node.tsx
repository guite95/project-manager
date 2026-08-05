"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { KIND_STYLE } from "./kind-style";
import type { NodeKind } from "./types";

/**
 * 그룹 박스 안쪽 여백.
 *
 * layout.ts 가 **자식 노드 크기에 미리 이 여백을 더해서** Dagre 에 넘긴다.
 * 그래야 Dagre 가 계산한 클러스터 경계에 여백이 이미 포함되어, 박스를 사후에
 * 넓히다가 옆 클러스터를 침범하는 일이 없다.
 * (Dagre 의 클러스터 경계 노드는 width/height 가 0이라, 사후 확장은 곧바로
 *  클러스터 간 간격을 잡아먹는다.)
 *
 * 라벨은 이 여백 안쪽 위에 얹히므로 GROUP_LABEL_H < GROUP_PAD 여야 한다.
 */
export const GROUP_PAD = 30;
export const GROUP_LABEL_H = 24;

export type GroupRenderData = {
  label: string;
  kind?: NodeKind;
  w: number;
  h: number;
};

export function GroupNode({ data }: NodeProps<Node<GroupRenderData>>) {
  const line = data.kind
    ? KIND_STYLE[data.kind].border
    : "var(--bi-border-strong)";

  return (
    <div
      style={{
        width: data.w,
        height: data.h,
        borderRadius: 3,
        border: `1px solid ${line}`,
        // 그룹 배경은 자식 카드를 가리지 않게 아주 옅게만
        backgroundColor: "var(--bi-sidebar-bg)",
        opacity: 0.85,
      }}
    >
      <div
        style={{
          height: GROUP_LABEL_H,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: line,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {data.label}
      </div>
    </div>
  );
}
