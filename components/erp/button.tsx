"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { LoadingIndicator } from "./loading-indicator";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--bi-accent)] text-white hover:brightness-95 active:brightness-90",
  secondary:
    "bg-[var(--bi-bg)] text-[var(--bi-fg)] border border-[var(--bi-border)] hover:bg-[var(--bi-table-header)]",
  ghost:
    "bg-transparent text-[var(--bi-accent)] hover:bg-[var(--bi-accent-light)]",
  destructive:
    "bg-[var(--bi-error)] text-white hover:brightness-95 active:brightness-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-[26px] px-2.5 text-xs font-medium",
  md: "h-[30px] px-3 text-xs font-semibold",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-[4px] outline-none",
        "cursor-pointer transition-[color,background-color,filter] duration-[var(--bi-motion-fast)] ease-[var(--bi-ease)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? (
        <>
          <LoadingIndicator
            announce={false}
            label="처리 중"
            showLabel={false}
          />
          <span>처리 중…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
