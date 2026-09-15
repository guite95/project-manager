"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown, HiOutlineSearch } from "react-icons/hi";
import { cn } from "./cn";
import { resolveDropdownKey } from "./dropdown-navigation";
import { hangulIncludes } from "./hangul-match";
import { useAnchoredPopover } from "./use-anchored-popover";

export type DropdownOption = { value: string; label: string; description?: string };

export function Dropdown({ value, onChange, options, ariaLabel, searchable = true,
  searchPlaceholder = "검색", disabled = false, error = false, autoFocus = false,
  className, triggerClassName,
}: {
  value: string; onChange: (value: string) => void; options: readonly DropdownOption[]; ariaLabel: string;
  searchable?: boolean; searchPlaceholder?: string; disabled?: boolean; error?: boolean; autoFocus?: boolean;
  className?: string; triggerClassName?: string;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelWidth, setPanelWidth] = useState(240);
  const { triggerRef, panelRef, position } = useAnchoredPopover<HTMLButtonElement>(open && !disabled, panelWidth);
  const positioned = position !== null;
  const selected = options.find(option => option.value === value);
  const visibleOptions = useMemo(() => options.filter(option => hangulIncludes(`${option.label} ${option.description ?? ''}`, query)), [options, query]);
  const close = (restoreFocus = false) => {
    setOpen(false); setQuery(""); setActiveIndex(0);
    if (restoreFocus) triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) {
        setOpen(false); setQuery(""); setActiveIndex(0);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, panelRef]);
  useEffect(() => {
    if (open) panelRef.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, query, positioned, panelRef]);
  const openMenu = () => {
    if (disabled) return;
    setPanelWidth(Math.min(Math.max(240, triggerRef.current?.getBoundingClientRect().width ?? 240), window.innerWidth - 16));
    setActiveIndex(Math.max(0, options.findIndex(option => option.value === value)));
    setOpen(true);
  };
  const choose = (option: DropdownOption) => { close(true); onChange(option.value); };
  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Tab' && open) { close(true); return; }
    if (event.target instanceof HTMLInputElement && ['Home', 'End'].includes(event.key)) return;
    if (event.key === 'Enter' && open && !visibleOptions.length) { event.preventDefault(); event.stopPropagation(); return; }
    const action = resolveDropdownKey(event.key, open, activeIndex, visibleOptions.length);
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    if (action.type === "open") openMenu();
    else if (action.type === "close") close(true);
    else if (action.type === "move") setActiveIndex(action.index);
    else choose(visibleOptions[action.index]);
  };
  return <div className={cn("relative min-w-0", className)} ref={rootRef} data-erp-dropdown
    onBlur={event => {
      const target = event.relatedTarget as Node | null;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    }}>
    <button ref={triggerRef} aria-controls={open ? listboxId : undefined} aria-expanded={open && !disabled}
      aria-haspopup="listbox" aria-label={ariaLabel} autoFocus={autoFocus} disabled={disabled} type="button"
      className={cn("flex h-[30px] w-full min-w-0 items-center justify-between gap-2 rounded-[4px] border bg-[var(--bi-bg)] px-2 text-left text-[12px] outline-none",
        "focus-visible:border-[var(--bi-accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--bi-accent)]",
        error ? "border-[var(--bi-error)]" : "border-[var(--bi-border)]",
        disabled && "cursor-not-allowed bg-[var(--bi-sidebar-bg)] opacity-45", triggerClassName)}
      onClick={() => open ? close() : openMenu()} onKeyDown={handleMenuKeyDown}>
      <span className={cn("min-w-0 flex-1 truncate", !selected && "text-[var(--bi-muted)]")}>{selected?.label ?? "선택"}</span>
      <HiChevronDown aria-hidden className={cn("shrink-0 transition-transform", open && "rotate-180")} size={14} />
    </button>
    {open && !disabled && position ? createPortal(<div ref={panelRef} data-erp-popover data-erp-dropdown
      className="fixed z-[100] overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] shadow-lg"
      style={{ ...position, width: panelWidth, maxWidth: 'calc(100vw - 16px)' }} onKeyDown={handleMenuKeyDown}>
      {searchable ? <label className="flex items-center gap-1.5 border-b border-[var(--bi-border)] px-2">
        <HiOutlineSearch aria-hidden className="shrink-0 text-[var(--bi-muted)]" size={13} />
        <span className="sr-only">{ariaLabel} 검색</span>
        <input autoFocus role="combobox" aria-expanded={true} aria-autocomplete="list" aria-controls={listboxId}
          aria-activedescendant={visibleOptions[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          className="h-9 min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--bi-muted)]"
          value={query} placeholder={searchPlaceholder} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }} />
      </label> : null}
      <div className="max-h-[min(16rem,50dvh)] overflow-y-auto py-1" id={listboxId} role="listbox" aria-label={ariaLabel}>
        {visibleOptions.length ? visibleOptions.map((option, index) => <button key={option.value} type="button" role="option"
          id={`${listboxId}-${index}`} data-option-index={index} tabIndex={-1} aria-selected={option.value === value}
          className={cn("block w-full px-3 py-2 text-left text-[12px]", index === activeIndex && "bg-[var(--bi-table-header)]", option.value === value && "font-semibold text-[var(--bi-accent)]")}
          onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
          <span className="block break-words">{option.label}</span>
          {option.description ? <span className="mt-1 block text-[11px] font-normal text-[var(--bi-muted)]">{option.description}</span> : null}
        </button>) : <p className="px-2 py-3 text-center text-[11px] text-[var(--bi-muted)]">일치하는 항목 없음</p>}
      </div>
    </div>, document.fullscreenElement ?? document.body) : null}
  </div>;
}
