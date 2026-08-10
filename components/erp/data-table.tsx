"use client";

import type { MouseEvent, ReactNode } from "react";
import { EmptyState } from "./empty-state";

export type DataTableColumn<Row> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
};

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage,
  columnWidths,
  onResizeStart,
  onResizeStep,
}: {
  caption: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyMessage: string;
  columnWidths?: Record<string, number>;
  onResizeStart?: (key: string, event: MouseEvent) => void;
  onResizeStep?: (key: string, delta: number) => void;
}) {
  const fixed = Boolean(columnWidths);
  const minWidth = fixed
    ? columns.reduce(
        (sum, column) => sum + (columnWidths?.[column.key] ?? 0),
        0
      )
    : undefined;

  return (
    <table
      className={`w-full border-collapse text-[12px] ${fixed ? "table-fixed" : ""}`}
      style={minWidth ? { minWidth } : undefined}
    >
      <caption className="sr-only">{caption}</caption>
      {fixed ? (
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: columnWidths?.[column.key] }} />
          ))}
        </colgroup>
      ) : null}
      <thead className="bg-[var(--bi-table-header)] text-[var(--bi-muted)]">
        <tr>
          {columns.map((column) => (
            <th
              className={`relative overflow-hidden border-b border-[var(--bi-border)] px-4 py-3 text-[11px] font-semibold ${
                column.align === "right" ? "text-right" : "text-left"
              }`}
              key={column.key}
              scope="col"
            >
              <span className="block truncate">{column.header}</span>
              {onResizeStart ? (
                <span
                  aria-label={`${column.header} 너비 조절`}
                  aria-orientation="vertical"
                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize outline-none after:absolute after:top-1/4 after:right-0 after:h-1/2 after:w-px after:bg-[var(--bi-border-strong)] focus-visible:bg-[var(--bi-accent-light)]"
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      onResizeStep?.(column.key, -10);
                    }
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      onResizeStep?.(column.key, 10);
                    }
                  }}
                  onMouseDown={(event) => onResizeStart(column.key, event)}
                  role="separator"
                  tabIndex={0}
                />
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyState colSpan={columns.length} message={emptyMessage} />
        ) : (
          rows.map((row) => (
            <tr
              className="transition-colors hover:bg-[var(--bi-table-header)]"
              key={rowKey(row)}
            >
              {columns.map((column) => (
                <td
                  className={`border-b border-[var(--bi-border)] px-4 py-3 ${
                    column.align === "right"
                      ? "text-right tabular-nums"
                      : "text-left"
                  }`}
                  key={column.key}
                >
                  <span className="block truncate">{column.render(row)}</span>
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
