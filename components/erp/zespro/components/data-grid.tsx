"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type Key,
  type ReactNode,
  type RefObject,
  type TableHTMLAttributes
} from "react";
import { cx } from "../lib/class-names";
import { SearchIcon } from "./icons";

function gridStyle(columns: string, style?: CSSProperties): CSSProperties {
  return { ...style, gridTemplateColumns: columns };
}

export type DataGridProps = {
  children: ReactNode;
  minWidth?: number | string;
  desktopOnly?: boolean;
  className?: string;
};

export function DataGrid({ children, minWidth, desktopOnly = false, className }: DataGridProps) {
  return (
    <div
      className={cx("pds", "pds-data-grid", desktopOnly && "pds-data-grid--desktop-only", className)}
      style={minWidth ? { minWidth } : undefined}
    >
      {children}
    </div>
  );
}

export type DataGridTableProps = TableHTMLAttributes<HTMLTableElement>;

export function DataGridTable({ children, className, style, ...props }: DataGridTableProps) {
  return (
    <table
      {...props}
      className={cx("pds", "pds-data-grid", "pds-data-grid--table", className)}
      style={style}
    >
      {children}
    </table>
  );
}

export type DataGridToolbarOption = {
  value: string;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
};

export type DataGridToolbarProps = {
  toggleOptions?: DataGridToolbarOption[];
  toggleValue?: string;
  onToggleChange?: (value: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  className?: string;
};

export function DataGridToolbar({
  toggleOptions = [],
  toggleValue,
  onToggleChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "검색",
  searchAriaLabel = "검색",
  className
}: DataGridToolbarProps) {
  return (
    <div className={cx("pds", "pds-data-grid-toolbar", className)}>
      {toggleOptions.length > 0 && onToggleChange ? (
        <div className="pds-data-grid-toolbar__toggles">
          {toggleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.title}
              disabled={option.disabled}
              aria-pressed={option.value === toggleValue}
              className={cx("pds-data-grid-toolbar__toggle", option.value === toggleValue && "is-active")}
              onClick={() => onToggleChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : <div className="pds-data-grid-toolbar__spacer" />}
      {searchValue !== undefined && onSearchChange ? (
        <label className="pds-data-grid-toolbar__search">
          <SearchIcon size={13} />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel}
          />
        </label>
      ) : null}
    </div>
  );
}

export function DataGridHeader({
  columns,
  children,
  className,
  style
}: {
  columns: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={cx("pds-data-grid__header", className)} style={gridStyle(columns, style)}>{children}</div>;
}

export type SortDirection = "asc" | "desc";

export function DataGridHeaderCell({
  label,
  title,
  align = "left",
  className,
  sortDirection,
  onSort
}: {
  label: ReactNode;
  title?: string;
  align?: "left" | "right" | "center";
  className?: string;
  sortDirection?: SortDirection | null;
  onSort?: () => void;
}) {
  const content = (
    <>
      <span className="pds-data-grid__header-label">{label}</span>
      {onSort ? <span className="pds-data-grid__sort-mark">{sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : "↕"}</span> : null}
    </>
  );
  const classes = cx("pds-data-grid__header-cell", `pds-align--${align}`, sortDirection && "is-sorted", className);
  if (onSort) {
    return (
      <button
        type="button"
        className={classes}
        title={title}
        aria-label={typeof label === "string" ? `${label} 정렬` : "정렬"}
        onClick={onSort}
      >
        {content}
      </button>
    );
  }
  return <div className={classes} title={title}>{content}</div>;
}

export function DataGridRow({
  columns,
  children,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { columns: string; children: ReactNode }) {
  return (
    <div {...props} className={cx("pds-data-grid__row", className)} style={gridStyle(columns, style)}>
      {children}
    </div>
  );
}

export function DataGridButtonRow({
  columns,
  children,
  className,
  style,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { columns: string; children: ReactNode }) {
  return (
    <button {...props} type={type} className={cx("pds-data-grid__row", "pds-data-grid__button-row", className)} style={gridStyle(columns, style)}>
      {children}
    </button>
  );
}

export function DataGridEmpty({ children }: { children: ReactNode }) {
  return <div className="pds-data-grid__empty">{children}</div>;
}

export type VirtualDataGridRowsProps<T> = {
  items: readonly T[];
  scrollRef: RefObject<HTMLElement | null>;
  rowHeight?: number;
  overscan?: number;
  scrollTopOffset?: number;
  empty?: ReactNode;
  getItemKey?: (item: T, index: number) => Key;
  renderRow: (item: T, index: number) => ReactNode;
};

export function VirtualDataGridRows<T>({
  items,
  scrollRef,
  rowHeight = 44,
  overscan = 8,
  scrollTopOffset = 36,
  empty,
  getItemKey,
  renderRow
}: VirtualDataGridRowsProps<T>) {
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 600 });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setViewport({ scrollTop: element.scrollTop, height: element.clientHeight || 600 });
      });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resizeObserver?.observe(element);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      element.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
    };
  }, [scrollRef]);

  const virtual = useMemo(() => {
    const effectiveTop = Math.max(0, viewport.scrollTop - scrollTopOffset);
    const start = Math.max(0, Math.floor(effectiveTop / rowHeight) - overscan);
    const count = Math.ceil(viewport.height / rowHeight) + overscan * 2;
    const end = Math.min(items.length, start + count);
    return { rows: items.slice(start, end), start, offset: start * rowHeight, height: items.length * rowHeight };
  }, [items, overscan, rowHeight, scrollTopOffset, viewport.height, viewport.scrollTop]);

  if (items.length === 0) return empty ? <>{empty}</> : null;
  return (
    <div style={{ height: virtual.height, position: "relative" }}>
      <div style={{ left: 0, position: "absolute", right: 0, top: 0, transform: `translateY(${virtual.offset}px)` }}>
        {virtual.rows.map((item, virtualIndex) => {
          const index = virtual.start + virtualIndex;
          return <Fragment key={getItemKey ? getItemKey(item, index) : index}>{renderRow(item, index)}</Fragment>;
        })}
      </div>
    </div>
  );
}

export function useDataGridScrollRef<T extends HTMLElement = HTMLDivElement>() {
  return useRef<T>(null);
}

export type DataGridFooterStat = {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "accent" | "success" | "warning" | "error";
};

export type DataGridFooterProps = {
  /** 좌측 합계 항목 목록 — label·value 쌍 */
  stats?: readonly DataGridFooterStat[];
  /** 우측 보조 슬롯 (페이지네이션·갱신 시각 등) */
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
};

/**
 * 표 하단 고정 합계 푸터. 건수·합계 금액 같은 집계를 표 스크롤과 무관하게
 * 목록 영역 맨 아래에 고정해 보여준다. 표 스크롤 컨테이너의 형제로 배치한다.
 */
export function DataGridFooter({ stats, trailing, children, className }: DataGridFooterProps) {
  return (
    <div className={cx("pds", "pds-data-grid-footer", className)}>
      {stats?.length ? (
        <div className="pds-data-grid-footer__stats">
          {stats.map((stat, index) => (
            <span className="pds-data-grid-footer__stat" key={index}>
              <span className="pds-data-grid-footer__stat-label">{stat.label}</span>
              <span className={cx("pds-data-grid-footer__stat-value", `pds-data-grid-footer__stat-value--${stat.tone ?? "default"}`)}>
                {stat.value}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {children}
      {trailing ? <div className="pds-data-grid-footer__trailing">{trailing}</div> : null}
    </div>
  );
}
