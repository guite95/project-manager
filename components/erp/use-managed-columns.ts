"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useSharedPreferences } from "./use-shared-preferences";
import type { UiPreferenceValues } from "@/lib/ui-preferences";
import type { DataTableColumn } from "./data-table";
import {
  normalizeTablePreferences,
  type TableColumnDefinition,
  type TablePreferences,
} from "@/lib/ui-reference/table-preferences";

export type ManagedColumn<Row> = DataTableColumn<Row> &
  Omit<TableColumnDefinition, "label">;

export function useManagedColumns<Row>(
  storageKey: string,
  columns: ManagedColumn<Row>[]
) {
  const definitions = useMemo<TableColumnDefinition[]>(
    () =>
      columns.map((column) => ({
        key: column.key,
        label: column.header,
        defaultVisible: column.defaultVisible,
        defaultWidth: column.defaultWidth,
        minWidth: column.minWidth,
        maxWidth: column.maxWidth,
      })),
    [columns]
  );
  const defaults = useMemo(
    () => normalizeTablePreferences(definitions, undefined),
    [definitions]
  );
  const legacy = useMemo(() => ({
    key: storageKey,
    read: (value: unknown): UiPreferenceValues => {
      const normalized = normalizeTablePreferences(definitions, value);
      return { order: normalized.order, hidden: normalized.hidden,
        ...Object.fromEntries(Object.entries(normalized.widths).map(([key, width]) => [`width:${key}`, width])) };
    },
  }), [storageKey, definitions]);
  const shared = useSharedPreferences("reference-columns", undefined, legacy);
  const prefs = useMemo(() => normalizeTablePreferences(definitions, {
    order: shared.values.order,
    hidden: shared.values.hidden,
    widths: Object.fromEntries(Object.entries(shared.values).filter(([key]) => key.startsWith("width:")).map(([key, value]) => [key.slice(6), value])),
  }), [definitions, shared.values]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const setPrefs = useCallback((change: TablePreferences | ((current: TablePreferences) => TablePreferences)) => {
    if (!shared.ready) return;
    const current = prefsRef.current;
    const next = typeof change === "function" ? change(current) : change;
    const changes: UiPreferenceValues = {};
    if (JSON.stringify(current.order) !== JSON.stringify(next.order)) changes.order = next.order;
    if (JSON.stringify(current.hidden) !== JSON.stringify(next.hidden)) changes.hidden = next.hidden;
    for (const [key, width] of Object.entries(next.widths)) {
      if (current.widths[key] !== width) changes[`width:${key}`] = width;
    }
    prefsRef.current = next;
    shared.update(changes);
  }, [shared.ready, shared.update]);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { resizeCleanupRef.current?.(); }, []);

  const toggle = useCallback((key: string) => {
    setPrefs((current) => {
      const hidden = new Set(current.hidden);
      if (hidden.has(key)) {
        hidden.delete(key);
      } else {
        const visibleCount = current.order.filter(
          (columnKey) => !hidden.has(columnKey)
        ).length;
        if (visibleCount <= 1) return current;
        hidden.add(key);
      }
      return { ...current, hidden: [...hidden] };
    });
  }, [setPrefs]);

  const move = useCallback((key: string, targetIndex: number) => {
    setPrefs((current) => {
      const fromIndex = current.order.indexOf(key);
      if (fromIndex < 0) return current;
      const nextIndex = Math.min(
        current.order.length - 1,
        Math.max(0, targetIndex)
      );
      if (fromIndex === nextIndex) return current;
      const order = [...current.order];
      order.splice(fromIndex, 1);
      order.splice(nextIndex, 0, key);
      return { ...current, order };
    });
  }, [setPrefs]);

  const setWidth = useCallback(
    (key: string, width: number) => {
      setPrefs((current) =>
        normalizeTablePreferences(definitions, {
          ...current,
          widths: { ...current.widths, [key]: width },
        })
      );
    },
    [definitions, setPrefs]
  );

  const startResize = useCallback(
    (key: string, event: ReactMouseEvent) => {
      event.preventDefault();
      resizeCleanupRef.current?.();
      const startX = event.clientX;
      const startWidth = prefs.widths[key] ?? 120;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMove = (moveEvent: MouseEvent) => {
        setWidth(key, startWidth + moveEvent.clientX - startX);
      };
      const cleanup = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", cleanup);
        window.removeEventListener("blur", cleanup);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        if (resizeCleanupRef.current === cleanup) {
          resizeCleanupRef.current = null;
        }
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", cleanup);
      window.addEventListener("blur", cleanup);
      resizeCleanupRef.current = cleanup;
    },
    [prefs.widths, setWidth]
  );

  const reset = useCallback(() => setPrefs(defaults), [defaults, setPrefs]);
  const byKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns]
  );
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const visibleColumns = useMemo(
    () =>
      prefs.order.flatMap((key) => {
        const column = byKey.get(key);
        return column && !hidden.has(key) ? [column] : [];
      }),
    [byKey, hidden, prefs.order]
  );

  return {
    prefs,
    visibleColumns,
    columnWidths: prefs.widths,
    toggle,
    move,
    resizeBy: (key: string, delta: number) =>
      setWidth(key, (prefs.widths[key] ?? 120) + delta),
    startResize,
    reset,
    ready: shared.ready,
    saving: shared.saving,
    error: shared.error,
  };
}
