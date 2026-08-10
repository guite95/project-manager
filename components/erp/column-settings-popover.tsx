"use client";

import { useEffect, useRef, useState } from "react";
import {
  HiChevronDown,
  HiChevronUp,
  HiOutlineCog,
  HiOutlineMenuAlt2,
  HiRefresh,
} from "react-icons/hi";
import type { ManagedColumn } from "./use-managed-columns";
import type { TablePreferences } from "@/lib/ui-reference/table-preferences";
import { Button } from "./button";

export function ColumnSettingsPopover<Row>({
  columns,
  prefs,
  onToggle,
  onMove,
  onReset,
}: {
  columns: ManagedColumn<Row>[];
  prefs: TablePreferences;
  onToggle: (key: string) => void;
  onMove: (key: string, targetIndex: number) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const columnByKey = new Map(columns.map((column) => [column.key, column]));
  const visibleCount = prefs.order.filter(
    (key) => !prefs.hidden.includes(key)
  ).length;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        size="sm"
        variant="secondary"
      >
        <HiOutlineCog aria-hidden size={14} />
        컬럼 설정
      </Button>

      {open ? (
        <div
          aria-label="테이블 컬럼 설정"
          className="absolute top-[calc(100%+4px)] right-0 z-40 w-72 border border-[var(--bi-border)] bg-[var(--bi-card-bg)]"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-[var(--bi-border)] px-3 py-2">
            <strong className="text-[12px]">표시·순서</strong>
            <button
              className="inline-flex items-center gap-1 text-[11px] text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"
              onClick={onReset}
              type="button"
            >
              <HiRefresh aria-hidden size={12} />
              초기화
            </button>
          </div>
          <div className="p-1">
            {prefs.order.map((key, index) => {
              const column = columnByKey.get(key);
              if (!column) return null;
              const visible = !prefs.hidden.includes(key);
              return (
                <div
                  className="flex items-center gap-1 border-b border-[var(--bi-border)] px-2 py-1.5 last:border-b-0"
                  draggable
                  key={key}
                  onDragEnd={() => setDraggedKey(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggedKey(key)}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedKey) onMove(draggedKey, index);
                    setDraggedKey(null);
                  }}
                >
                  <HiOutlineMenuAlt2
                    aria-hidden
                    className="shrink-0 cursor-grab text-[var(--bi-muted)]"
                    size={14}
                  />
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[12px]">
                    <input
                      checked={visible}
                      disabled={visible && visibleCount <= 1}
                      onChange={() => onToggle(key)}
                      type="checkbox"
                    />
                    <span className="truncate">{column.header}</span>
                  </label>
                  <button
                    aria-label={`${column.header} 위로 이동`}
                    className="p-1 text-[var(--bi-muted)] hover:text-[var(--bi-fg)] disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => onMove(key, index - 1)}
                    type="button"
                  >
                    <HiChevronUp aria-hidden size={13} />
                  </button>
                  <button
                    aria-label={`${column.header} 아래로 이동`}
                    className="p-1 text-[var(--bi-muted)] hover:text-[var(--bi-fg)] disabled:opacity-30"
                    disabled={index === prefs.order.length - 1}
                    onClick={() => onMove(key, index + 1)}
                    type="button"
                  >
                    <HiChevronDown aria-hidden size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="border-t border-[var(--bi-border)] px-3 py-2 text-[10px] leading-[1.5] text-[var(--bi-muted)]">
            행을 끌거나 화살표로 순서를 바꾸고, 헤더 경계를 끌어 너비를
            조절합니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
