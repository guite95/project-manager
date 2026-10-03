import type { ReactNode } from "react";

export function DetailSection({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[var(--bi-border)] last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bi-border)] bg-[var(--bi-surface-subtle)] px-4 py-3 sm:px-6">
        <h2 className="text-[14px] font-semibold text-[var(--bi-fg)]">
          {title}
        </h2>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
