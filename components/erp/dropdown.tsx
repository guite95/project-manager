"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { HiChevronDown, HiOutlineSearch } from "react-icons/hi";
import { cn } from "./cn";
import { hangulIncludes } from "./hangul-match";

export type DropdownOption = { value: string; label: string };

export function Dropdown({
  value,
  onChange,
  options,
  ariaLabel,
  searchable = false,
  disabled = false,
  error = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  ariaLabel: string;
  searchable?: boolean;
  disabled?: boolean;
  error?: boolean;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const visibleOptions = useMemo(
    () => options.filter((option) => hangulIncludes(option.label, query)),
    [options, query]
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    searchRef.current?.focus();
  }, [open, searchable]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const choose = (option: DropdownOption) => {
    onChange(option.value);
    close();
  };

  const openMenu = () => {
    if (disabled) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  };

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        visibleOptions.length ? (index + 1) % visibleOptions.length : 0
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        visibleOptions.length
          ? (index - 1 + visibleOptions.length) % visibleOptions.length
          : 0
      );
      return;
    }
    if (event.key === "Enter" && visibleOptions[activeIndex]) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "flex h-[30px] w-full min-w-32 items-center justify-between gap-2 rounded-[4px] border bg-[var(--bi-bg)] px-2 text-left text-[12px] outline-none",
          "focus-visible:border-[var(--bi-accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--bi-accent)]",
          error ? "border-[var(--bi-error)]" : "border-[var(--bi-border)]",
          disabled && "cursor-not-allowed bg-[var(--bi-sidebar-bg)] opacity-45"
        )}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            openMenu();
          }
        }}
        type="button"
      >
        <span className={cn("truncate", !selected && "text-[var(--bi-muted)]")}>
          {selected?.label ?? "선택"}
        </span>
        <HiChevronDown
          aria-hidden
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
          size={14}
        />
      </button>

      {open ? (
        <div
          className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-full border border-[var(--bi-border)] bg-[var(--bi-card-bg)]"
          onKeyDown={handleMenuKeyDown}
        >
          {searchable ? (
            <label className="flex items-center gap-1.5 border-b border-[var(--bi-border)] px-2">
              <HiOutlineSearch
                aria-hidden
                className="shrink-0 text-[var(--bi-muted)]"
                size={13}
              />
              <span className="sr-only">{ariaLabel} 검색</span>
              <input
                aria-activedescendant={
                  visibleOptions[activeIndex]
                    ? `${listboxId}-${activeIndex}`
                    : undefined
                }
                aria-controls={listboxId}
                className="h-[30px] min-w-44 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--bi-muted)]"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder="검색"
                ref={searchRef}
                role="combobox"
                value={query}
              />
            </label>
          ) : null}
          <div className="max-h-48 overflow-y-auto py-1" id={listboxId} role="listbox">
            {visibleOptions.length ? (
              visibleOptions.map((option, index) => (
                <button
                  aria-selected={option.value === value}
                  className={cn(
                    "flex w-full items-center px-2 py-1.5 text-left text-[12px]",
                    index === activeIndex && "bg-[var(--bi-table-header)]",
                    option.value === value &&
                      "font-semibold text-[var(--bi-accent)]"
                  )}
                  id={`${listboxId}-${index}`}
                  key={option.value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  role="option"
                  type="button"
                >
                  {option.label}
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-center text-[11px] text-[var(--bi-muted)]">
                일치하는 항목 없음
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
