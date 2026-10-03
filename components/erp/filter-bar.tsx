"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function SearchInput({
  search,
  onSearchChange,
  searchPlaceholder = "코드·이름 검색",
  ariaLabel = "검색",
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      className={cn(
        "bi-control h-9 w-64 max-w-full rounded-[4px] border border-[var(--bi-control-border)] bg-[var(--bi-card-bg)] px-3 text-[13px] outline-none",
        "focus:border-[var(--bi-accent)]",
        className,
      )}
      onChange={(event) => onSearchChange(event.target.value)}
      type="search"
      placeholder={searchPlaceholder}
      value={search}
    />
  );
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "코드·이름 검색",
  className,
  children,
  actions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  className?: string;
  children?: ReactNode;
  /** 우측 끝에 붙는 주 동작(업로드·등록 등). children과 달리 검색·필터에서 떨어져 배치된다. */
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-b border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-4 py-3 sm:px-6",
        className,
      )}
    >
      <SearchInput
        onSearchChange={onSearchChange}
        search={search}
        searchPlaceholder={searchPlaceholder}
      />
      {children}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
