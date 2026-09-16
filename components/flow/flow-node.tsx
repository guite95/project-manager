"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { KIND_STYLE } from "./kind-style";
import { EntityNode } from "./entity-node";
import type { FlowDirection, FlowNodeData } from "./types";
import type { ErdPort } from "../../lib/erd/routes";

/**
 * 렌더 시점에만 쓰는 노드 데이터. 선언(`FlowNodeData`)에 배치 방향·폭을 넣지
 * 않기 위해, layoutChart() 가 계산한 값을 여기서 덧붙인다. 커스텀 노드는
 * `sourcePosition`/`targetPosition` 을 무시하고 `<Handle position>` 을 따르므로
 * 핸들 위치를 직접 정해줘야 한다.
 */
export type FlowRenderData = FlowNodeData & {
  dir: FlowDirection;
  w: number;
  /** 전체 배치를 유지하면서 현재 선택한 테이블을 표시한다. */
  emphasized?: boolean;
  erdPorts?: ErdPort[];
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
  if (data.entity) return <EntityNode data={data} />;
  const s = KIND_STYLE[data.kind];
  const horizontal = data.dir === "LR";
  const lines = toLines(data.sub);
  const compact = s.compact === true;
  const sections = data.sections?.length ? data.sections : undefined;
  const screens = data.role === 'logic' ? [] : data.screen ? [data.screen] : sections?.filter(section => section.title === '화면').flatMap(section => section.lines) ?? [];
  const bodySections = sections?.filter(section => section.title !== '화면');
  const split = data.role !== undefined || data.sectioned || Boolean(sections);

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
        backgroundColor: split ? '#fff' : s.bg,
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

      {screens.length > 0 ? (
        <div aria-label="화면" style={{
          margin: `-${PAD_Y}px -${PAD_X}px 0`, padding: `6px ${PAD_X}px`,
          backgroundColor: '#eef2f6', color: '#000', borderBottom: `1px solid ${s.border}`,
          fontSize: SUB_FONT, lineHeight: `${SUB_LH}px`, fontWeight: 600, textAlign: 'left',
        }}>
          {screens.map((screen, index) => <div key={index}>{screen}</div>)}
        </div>
      ) : null}

      <div
        style={{
          fontSize: compact ? 11 : LABEL_FONT,
          fontWeight: 700,
          color: s.fg,
          lineHeight: `${LABEL_LH}px`,
          ...(split ? { backgroundColor: s.bg, margin: `${screens.length ? 0 : -PAD_Y}px -${PAD_X}px 0`, padding: `${PAD_Y}px ${PAD_X}px` } : {}),
        }}
      >
        {data.label}
      </div>

      {sections ? (
        <div style={{ color: '#000', backgroundColor: '#fff', margin: `0 -${PAD_X}px -${PAD_Y}px` }}>
          {bodySections?.map((section, index) => (
            <section key={index} style={{ padding: `8px ${PAD_X}px`, borderTop: '1px solid #d1d5db' }}>
              <div style={{ fontSize: SUB_FONT, lineHeight: `${SUB_LH}px`, fontWeight: 700, marginBottom: 4 }}>{section.title}</div>
              {section.lines.map((line, i) => (
                <div key={i} style={{ fontSize: SUB_FONT, lineHeight: `${SUB_LH}px` }}>{line}</div>
              ))}
            </section>
          ))}
        </div>
      ) : lines.length ? (
        <div style={data.sectioned ? {
          marginTop: 7, paddingTop: 7, borderTop: `1px solid ${s.border}`,
          marginLeft: -PAD_X, marginRight: -PAD_X, paddingLeft: PAD_X, paddingRight: PAD_X,
        } : { marginTop: 3 }}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: SUB_FONT,
                color: split ? '#000' : s.subFg,
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
      {Object.values(Position).flatMap(position => [
        <Handle key={`in-${position}`} id={`in-${position}`} type="target" position={position} style={{ ...handleStyle, opacity: 0 }} />,
        <Handle key={`out-${position}`} id={`out-${position}`} type="source" position={position} style={{ ...handleStyle, opacity: 0 }} />,
      ])}
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
