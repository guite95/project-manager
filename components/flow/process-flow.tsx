"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HiOutlineArrowsExpand, HiOutlineX } from "react-icons/hi";
import { ExportSvgButton } from "./export-svg-button";
import { FlowNode } from "./flow-node";
import { GroupNode } from "./group-node";
import { layoutChart } from "./layout";
import type { FlowChart } from "./types";

/* -------------------------------------------------------------------------
 * 읽기 전용 플로우차트 뷰어.
 *
 * 인라인과 전체화면이 **같은 <FlowCanvas/>** 를 재사용한다 (두 벌 관리 금지).
 * 노드 드래그/선택/연결은 전부 끈다 — 이건 다이어그램이지 편집기가 아니다.
 * ---------------------------------------------------------------------- */

// 타입 키는 CSS 클래스(`.react-flow__node-<type>`)가 되므로 React Flow 기본
// 타입 이름(default/input/output/group)과 겹치면 안 된다 — 기본 스타일이 래퍼에
// 붙어 커스텀 노드 위에 테두리·배경이 한 겹 더 그려진다.
const nodeTypes = { flow: FlowNode, flowGroup: GroupNode };

const HINT = "두 손가락 스크롤=이동 · 핀치/Cmd+스크롤=확대";

export function FlowCanvas({ chart }: { chart: FlowChart }) {
  const { nodes, edges } = useMemo(() => layoutChart(chart), [chart]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      // 넓은 차트도 fitView 가 전부 담을 수 있어야 한다. 0.3 이면 노드가 많은
      // LR 차트에서 클램프에 걸려 좌우가 잘린다.
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      // 트랙패드: 두 손가락 스크롤 = 화면 이동, 핀치/Cmd+스크롤 = 줌
      panOnScroll
      panOnScrollMode={PanOnScrollMode.Free}
      zoomOnScroll={false}
      zoomOnPinch
      zoomOnDoubleClick={false}
      panOnDrag
      proOptions={{ hideAttribution: true }}
      style={{ backgroundColor: "var(--bi-bg)" }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="var(--bi-border)"
      />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

export function ProcessFlow({
  chart,
  height = 560,
  fill = false,
}: {
  chart: FlowChart;
  /** 인라인 임베드 시 캔버스 높이(px). `fill` 이 true 면 무시된다. */
  height?: number;
  /** true 면 부모 높이를 꽉 채운다 (전용 페이지용). 부모가 flex 컨테이너여야 한다. */
  fill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 같은 라우트에서 차트만 바뀌는 경우(쿼리파람 이동·뒤로가기) 이 컴포넌트는
  // 살아남는다. 열어둔 모달이 새 차트로 이어지지 않게 닫는다.
  useEffect(() => {
    setOpen(false);
  }, [chart.slug]);

  // ESC 닫기 + 모달 열렸을 때 body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  return (
    <>
      <figure
        className={`overflow-hidden rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] ${
          fill ? "flex min-h-0 flex-1 flex-col" : "my-4"
        }`}
      >
        {/* key: 같은 라우트에서 쿼리파람만 바뀌면 Next 는 이 서브트리를 remount
            하지 않는다. 그러면 React Flow 의 fitView 가 다시 돌지 않아 이전
            차트의 줌·위치가 그대로 남는다. 차트가 바뀌면 캔버스를 새로 만든다. */}
        <ReactFlowProvider key={chart.slug}>
          <div className="flex items-center justify-between gap-3 border-b border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] px-3 py-1.5 text-[11px] text-[var(--bi-muted)]">
            <span className="truncate">
              {chart.caption ?? chart.title} · {HINT}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <ExportSvgButton slug={chart.slug} wrapper={wrapperRef} />
              <button
                type="button"
                onClick={openModal}
                className="flex shrink-0 items-center gap-1 rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-2 py-0.5 text-[11px] text-[var(--bi-fg)] transition hover:border-[var(--bi-accent)] hover:text-[var(--bi-accent)]"
                aria-label="전체화면으로 보기"
              >
                <HiOutlineArrowsExpand size={11} />
                전체화면
              </button>
            </span>
          </div>
          <div
            ref={wrapperRef}
            className={fill ? "min-h-0 flex-1" : undefined}
            style={fill ? undefined : { height }}
          >
            <FlowCanvas chart={chart} />
          </div>
        </ReactFlowProvider>
      </figure>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${chart.title} 전체화면`}
              className="fixed inset-0 z-[1000] flex flex-col bg-[var(--bi-bg)]"
            >
              <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] px-4">
                <div className="flex min-w-0 items-center gap-3 text-[13px]">
                  <span className="truncate font-semibold text-[var(--bi-fg)]">
                    {chart.title}
                  </span>
                  <span className="hidden truncate text-[var(--bi-muted)] sm:block">
                    {HINT} · Esc=닫기
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  title="닫기 (Esc)"
                  aria-label="닫기 (Esc)"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--bi-border)] bg-[var(--bi-card-bg)] text-[var(--bi-fg)] transition hover:border-[var(--bi-accent)] hover:text-[var(--bi-accent)]"
                >
                  <HiOutlineX size={14} />
                </button>
              </div>
              <div className="relative flex-1">
                <FlowCanvas key={chart.slug} chart={chart} />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
