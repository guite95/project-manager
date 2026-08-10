import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-h-20 items-end justify-between border-b border-[var(--bi-border)] px-6 py-4">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[var(--bi-accent)] uppercase">
          Workspace
        </p>
        <h2 className="mt-1 text-[16px] font-semibold text-[var(--bi-fg)]">
          {title}
        </h2>
        <p className="mt-1 text-[12px] text-[var(--bi-muted)]">
          {description}
        </p>
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}
