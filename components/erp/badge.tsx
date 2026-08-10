import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeVariant =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "neutral";

const VARIANTS: Record<BadgeVariant, string> = {
  primary: "bg-[var(--bi-accent-light)] text-[var(--bi-accent)]",
  success: "bg-[var(--bi-success)]/15 text-[var(--bi-success)]",
  warning: "bg-[var(--bi-warning)]/15 text-[var(--bi-warning)]",
  error: "bg-[var(--bi-error)]/10 text-[var(--bi-error)]",
  neutral: "bg-[#f2f2f2] text-[var(--bi-muted)]",
};

export function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold",
        VARIANTS[variant]
      )}
    >
      {children}
    </span>
  );
}
