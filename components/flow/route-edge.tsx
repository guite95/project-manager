"use client";

import { BaseEdge, getSmoothStepPath, useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import type { FlowPoint } from './types';

type RouteData = { waypoints?: FlowPoint[]; movePoint?: (id: string, index: number, point: FlowPoint) => void };
export function RouteEdge(props: EdgeProps<Edge<RouteData>>) {
  const { screenToFlowPosition } = useReactFlow();
  const points = props.data?.waypoints ?? [];
  const [automatic, lx, ly] = getSmoothStepPath(props);
  const all = [{ x: props.sourceX, y: props.sourceY }, ...points, { x: props.targetX, y: props.targetY }];
  const path = points.length ? all.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') : automatic;
  const label = points.length ? points[Math.floor(points.length / 2)] : { x: lx, y: ly };
  return <>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style}
      label={props.label} labelX={label.x} labelY={label.y} labelStyle={props.labelStyle}
      labelShowBg labelBgStyle={props.labelBgStyle} labelBgPadding={props.labelBgPadding} />
    {props.selected && props.data?.movePoint && points.map((p, index) => <circle key={index} cx={p.x} cy={p.y} r={7}
      fill="white" stroke="var(--bi-accent)" strokeWidth={2} className="nodrag nopan" style={{ cursor: 'move' }}
      onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) props.data?.movePoint?.(props.id, index, screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}
      onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} />)}
  </>;
}
