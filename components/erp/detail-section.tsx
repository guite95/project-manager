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
      <div className="flex items-center justify-between border-b border-[var(--bi-border)] px-6 py-3">
        <h2 className="text-[13px] font-semibold text-[var(--bi-fg)]">
          {title}
        </h2>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
