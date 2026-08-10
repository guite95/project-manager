"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  HiOutlineCheckCircle,
  HiOutlinePencilAlt,
  HiOutlineX,
} from "react-icons/hi";
import { Select } from "./select";
import { resolveFocusTrapTarget } from "./focus-trap";

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function DetailModal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        frameRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      ).filter((element) => element.offsetParent !== null);
    (focusables()[0] ?? frameRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusables();
      if (!elements.length) {
        event.preventDefault();
        frameRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      const target = resolveFocusTrapTarget({
        inside: Boolean(active && frameRef.current?.contains(active)),
        atFirst: active === first,
        atLast: active === last,
        shiftKey: event.shiftKey,
      });
      if (target) {
        event.preventDefault();
        (target === "first" ? first : last).focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && event.button === 0) onClose();
      }}
      role="dialog"
    >
      <div
        className="flex flex-col overflow-hidden border border-[var(--bi-border)] bg-[var(--bi-card-bg)]"
        ref={frameRef}
        style={{
          width: "min(1200px, calc(100vw - 48px))",
          height: "min(760px, calc(100vh - 48px))",
        }}
        tabIndex={-1}
      >
        <div className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)]">
          {children}
        </div>
      </div>
    </div>
  );
}

export function DetailRail({
  header,
  children,
}: {
  header?: { title: ReactNode; subtitle?: ReactNode };
  children: ReactNode;
}) {
  return (
    <aside className="min-h-0 overflow-y-auto border-r border-[var(--bi-border)] bg-[var(--bi-table-header)]">
      {header ? (
        <div className="flex h-10 items-center border-b border-[var(--bi-border)] px-3">
          <div className="min-w-0">
            <strong className="block truncate text-[14px] text-[var(--bi-fg)]">
              {header.title}
            </strong>
            {header.subtitle ? (
              <div className="mt-px truncate text-[11px] text-[var(--bi-muted)]">
                {header.subtitle}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {children}
    </aside>
  );
}

export function RailGroup({ title }: { title: string }) {
  return (
    <div className="border-t border-[var(--bi-border)] px-3 pt-2 pb-[3px] text-[10px] font-extrabold tracking-[0.02em] text-[var(--bi-muted)]">
      {title}
    </div>
  );
}

export function RailPairs({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="py-1">
      {items.map(([label, value]) => {
        const empty = value == null || value === "";
        return (
          <div
            className="flex items-baseline justify-between gap-3 px-3 py-1"
            key={label}
          >
            <span className="shrink-0 text-[11px] text-[var(--bi-muted)]">
              {label}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-right text-[12px] ${
                empty ? "text-[var(--bi-muted)]" : "text-[var(--bi-fg)]"
              }`}
              title={typeof value === "string" ? value : undefined}
            >
              {empty ? "-" : value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function RailMetric({
  label,
  value,
}: {
  label?: string;
  value: ReactNode;
}) {
  return (
    <div className="px-3 py-1.5">
      {label ? (
        <div className="text-[10px] text-[var(--bi-muted)]">{label}</div>
      ) : null}
      <div className="mt-px break-words text-[12px] text-[var(--bi-fg)]">
        {value || "-"}
      </div>
    </div>
  );
}

export function RailEditGroup({ children }: { children: ReactNode }) {
  return <dl className="grid pt-0.5 pb-1.5">{children}</dl>;
}

export type RailEditOption = { value: string; label: string };

export function RailEditRow({
  label,
  value,
  displayValue,
  editor = "text",
  options = [],
  onCommit,
}: {
  label: string;
  value: string;
  displayValue?: ReactNode;
  editor?: "select" | "text";
  options?: RailEditOption[];
  onCommit: (next: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const displayRef = useRef<HTMLElement>(null);
  const wasEditingRef = useRef(false);

  useEffect(() => {
    if (wasEditingRef.current && !editing) displayRef.current?.focus();
    wasEditingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    setEditing(false);
    setError(null);
    setDraft(value);
  }, [value]);

  const startEditing = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const commit = async (nextValue: string) => {
    if (saving) return;
    setDraft(nextValue);
    if (nextValue === value) {
      setEditing(false);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onCommit(nextValue);
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  const boxHeight = editor === "select" ? "h-[30px]" : "h-[26px]";
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2 px-3 py-px">
      <dt className="min-w-0 text-[11px] text-[var(--bi-muted)]">{label}</dt>
      {editing ? (
        <dd className="flex min-w-0 flex-col gap-1">
          {editor === "select" ? (
            <Select
              ariaLabel={label}
              autoFocus
              disabled={saving}
              onChange={(next) => void commit(next)}
              options={options}
              value={draft}
            />
          ) : (
            <input
              autoFocus
              className="h-[26px] w-full border border-[var(--bi-accent)] bg-[var(--bi-card-bg)] px-1.5 text-[12px] text-[var(--bi-fg)] outline-none"
              disabled={saving}
              onBlur={() => {
                if (!saving && !error) void commit(draft);
              }}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commit(draft);
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  setEditing(false);
                  setDraft(value);
                }
              }}
              value={draft}
            />
          )}
          {error ? (
            <span className="text-[11px] font-semibold text-[var(--bi-error)]">
              {error}
            </span>
          ) : null}
        </dd>
      ) : (
        <dd
          className={`group flex ${boxHeight} min-w-0 cursor-pointer items-center justify-end gap-1.5 rounded-[2px] border border-transparent px-1.5 text-right text-[12px] text-[var(--bi-fg)] hover:border-[var(--bi-border)] hover:bg-[var(--bi-card-bg)]`}
          onClick={startEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              startEditing();
            }
          }}
          role="button"
          ref={displayRef}
          tabIndex={0}
          title="클릭하여 수정"
        >
          <span className="min-w-0 truncate">{displayValue ?? value ?? "-"}</span>
          <HiOutlinePencilAlt
            aria-hidden
            className="shrink-0 text-[13px] text-[var(--bi-muted)] opacity-50 group-hover:text-[var(--bi-accent)] group-hover:opacity-100"
          />
        </dd>
      )}
    </div>
  );
}

export type DetailTab<Key extends string> = {
  key: Key;
  label: ReactNode;
  icon?: ReactNode;
  complete?: boolean;
  disabled?: boolean;
  title?: string;
};

export function DetailTabBar<Key extends string>({
  tabs,
  activeKey,
  onSelect,
  onClose,
}: {
  tabs: Array<DetailTab<Key>>;
  activeKey: Key;
  onSelect: (key: Key) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] pr-3">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex" role="tablist">
          {tabs.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <button
                aria-selected={active}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] transition-colors ${
                  active
                    ? "border-[var(--bi-accent)] font-semibold text-[var(--bi-fg)]"
                    : "border-transparent text-[var(--bi-muted)] hover:text-[var(--bi-fg)]"
                } ${tab.complete ? "text-[var(--bi-success)]" : ""} ${
                  tab.disabled ? "cursor-not-allowed opacity-40" : ""
                }`}
                disabled={tab.disabled}
                key={tab.key}
                onClick={() => onSelect(tab.key)}
                role="tab"
                title={tab.title}
                type="button"
              >
                {tab.icon ? <span className="text-[15px]">{tab.icon}</span> : null}
                {tab.label}
                {tab.complete ? (
                  <HiOutlineCheckCircle
                    aria-label="완료"
                    className="text-[14px] text-[var(--bi-success)]"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <button
        aria-label="상세 닫기"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border border-transparent text-[var(--bi-muted)] hover:border-[var(--bi-border)] hover:bg-[var(--bi-card-bg)] hover:text-[var(--bi-fg)]"
        onClick={onClose}
        type="button"
      >
        <HiOutlineX aria-hidden className="text-[16px]" />
      </button>
    </div>
  );
}

export function PanelSection({
  title,
  action,
  flush = false,
  children,
}: {
  title: string;
  action?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex min-h-[34px] shrink-0 items-center justify-between gap-2 border-b border-[var(--bi-border)] bg-[var(--bi-table-header)] py-0 pr-2 pl-3.5 text-[12px] font-extrabold text-[var(--bi-fg)]">
        <span>{title}</span>
        {action ? <span className="inline-flex items-center">{action}</span> : null}
      </div>
      <div
        className={
          flush
            ? "border-b border-[var(--bi-border)]"
            : "border-b border-[var(--bi-border)] p-3.5"
        }
      >
        {children}
      </div>
    </>
  );
}
