"use client";

import { cx } from "../lib/class-names";

export type TopLoadingBarProps = {
  active: boolean;
  variant?: "page" | "local";
  className?: string;
};

export function TopLoadingBar({ active, variant = "page", className }: TopLoadingBarProps) {
  if (!active) return null;
  return (
    <div
      className={cx("pds pds-loading-bar", `pds-loading-bar--${variant}`, className)}
      role="progressbar"
      aria-label="불러오는 중"
    >
      <span className="pds-loading-bar__indicator" />
    </div>
  );
}
