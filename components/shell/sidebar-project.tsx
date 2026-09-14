"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { HiChevronRight, HiOutlineSelector } from "react-icons/hi";

const DRAG_TYPE = "application/x-project-management-sidebar";

export function SidebarProject({
  slug, title, count, collapsed, onToggle, children,
  movable, dragging, onDragChange, onMove, onStep,
}: {
  slug: string;
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  movable: boolean;
  dragging: string | null;
  onDragChange: (slug: string | null) => void;
  onMove: (slug: string, target: string, edge: "before" | "after") => void;
  onStep: (slug: string, step: -1 | 1) => void;
}) {
  const [edge, setEdge] = useState<"before" | "after" | null>(null);
  const accepts = (event: DragEvent) => movable && dragging !== null && dragging !== slug &&
    event.dataTransfer.types.includes(DRAG_TYPE);
  const edgeAt = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  return (
    <div
      data-sidebar-project={slug}
      className={`relative ${dragging === slug ? "opacity-45" : ""}`}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setEdge(edgeAt(event));
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setEdge(null);
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        const source = event.dataTransfer.getData(DRAG_TYPE);
        if (source === dragging) onMove(source, slug, edgeAt(event));
        onDragChange(null);
        setEdge(null);
      }}
    >
      {dragging && dragging !== slug && edge ? (
        <span aria-hidden className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 bg-[var(--bi-accent)] ${edge === "before" ? "top-0" : "bottom-0"}`} />
      ) : null}
      <div className="group mx-2 flex h-8 items-center rounded-[3px] hover:bg-[var(--bi-sidebar-active)]">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[3px] pr-1 pl-2 text-[12px] font-semibold text-[var(--bi-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]"
        >
          <HiChevronRight size={10} aria-hidden className={`shrink-0 transition-transform ${collapsed ? "rotate-0" : "rotate-90"}`} />
          <span className="truncate">{title}</span>
          <span className="ml-auto font-normal text-[var(--bi-muted)]">{count}</span>
        </button>
        <button
          type="button"
          aria-label={`${title} 순서 이동`}
          aria-describedby="sidebar-order-help"
          aria-disabled={!movable}
          title="드래그하여 순서 변경 · ↑↓로 이동"
          draggable={movable}
          className={`mr-1 flex h-6 w-5 shrink-0 items-center justify-center rounded-[3px] text-[var(--bi-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)] ${movable ? "cursor-grab opacity-50 hover:opacity-100 focus:opacity-100 active:cursor-grabbing" : "cursor-not-allowed opacity-25"}`}
          onDragStart={(event) => {
            if (!movable) {event.preventDefault(); return;}
            event.dataTransfer.setData(DRAG_TYPE, slug);
            event.dataTransfer.effectAllowed = "move";
            if (event.currentTarget.parentElement) event.dataTransfer.setDragImage(event.currentTarget.parentElement, 16, 16);
            onDragChange(slug);
          }}
          onDragEnd={() => {onDragChange(null); setEdge(null);}}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            if (movable) onStep(slug, event.key === "ArrowUp" ? -1 : 1);
          }}
        >
          <HiOutlineSelector size={14} aria-hidden />
        </button>
      </div>
      {!collapsed ? children : null}
    </div>
  );
}
