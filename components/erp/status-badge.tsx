import type { ReactNode } from "react";

const variants = {
  ready:
    "border-[var(--bi-accent)] bg-[var(--bi-accent-light)] text-[var(--bi-accent)]",
  pending:
    "border-[var(--bi-border)] bg-[var(--bi-table-header)] text-[var(--bi-muted)]",
  blocked:
    "border-[var(--bi-error)] bg-[var(--bi-card-bg)] text-[var(--bi-error)]",
} as const;

export function StatusBadge({
  children,
  variant,
}: {
  children: ReactNode;
  variant: keyof typeof variants;
}) {
  return (
    <span
      className={`inline-flex rounded-sm border px-2 py-1 text-[12px] font-semibold ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
