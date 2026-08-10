import type { ReactNode } from "react";
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
}: {
  caption: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyMessage: string;
}) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <caption className="sr-only">{caption}</caption>
      <thead className="bg-[var(--bi-table-header)] text-[var(--bi-muted)]">
        <tr>
          {columns.map((column) => (
            <th
              className={`border-b border-[var(--bi-border)] px-4 py-3 text-[11px] font-semibold ${
                column.align === "right" ? "text-right" : "text-left"
              }`}
              key={column.key}
              scope="col"
            >
              {column.header}
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
