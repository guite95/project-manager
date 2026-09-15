"use client";

import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";

type RoutedEdge = Edge<{ points: { x: number; y: number }[] }>;

/** 테이블 사이 통로로 계산된 경로를 그대로 그린다. */
export function ErdEdge({ id, data, style, markerEnd, label, labelStyle, labelBgStyle, labelBgPadding }: EdgeProps<RoutedEdge>) {
  const points = data?.points ?? [];
  if (points.length < 2) return null;
  let longest = 0;
  let labelX = points[0].x, labelY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (length > longest) {
      longest = length;
      labelX = (a.x + b.x) / 2;
      labelY = (a.y + b.y) / 2;
    }
  }
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, strokeLinejoin: "round" }}
    label={label} labelX={labelX} labelY={labelY} labelStyle={labelStyle} labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding} />;
}
