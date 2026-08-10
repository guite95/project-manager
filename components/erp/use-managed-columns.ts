"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
  const [prefs, setPrefs] = useState<TablePreferences>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const stored: unknown = raw ? JSON.parse(raw) : undefined;
      setPrefs(normalizeTablePreferences(definitions, stored));
    } catch {
      setPrefs(defaults);
    } finally {
      setHydrated(true);
    }
  }, [defaults, definitions, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      // 저장이 차단돼도 현재 세션의 상태는 유지한다.
    }
  }, [hydrated, prefs, storageKey]);

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
  }, []);

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
  }, []);

  const setWidth = useCallback(
    (key: string, width: number) => {
      setPrefs((current) =>
        normalizeTablePreferences(definitions, {
          ...current,
          widths: { ...current.widths, [key]: width },
        })
      );
    },
    [definitions]
  );

  const startResize = useCallback(
    (key: string, event: ReactMouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = prefs.widths[key] ?? 120;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMove = (moveEvent: MouseEvent) => {
        setWidth(key, startWidth + moveEvent.clientX - startX);
      };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      };
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [prefs.widths, setWidth]
  );

  const reset = useCallback(() => setPrefs(defaults), [defaults]);
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
  };
}
