"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "코드·이름 검색",
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--bi-border)] px-6 py-3">
      <input
        aria-label="검색"
        className={cn(
          "h-[30px] w-64 rounded-[4px] border border-[var(--bi-border)] px-2 text-[12px] outline-none",
          "focus:border-[var(--bi-accent)]"
        )}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        value={search}
      />
      {children}
    </div>
  );
}
