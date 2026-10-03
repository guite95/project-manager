import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  level = 1,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className="flex min-h-24 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[var(--bi-border)] bg-[var(--bi-card-bg)] px-4 py-5 sm:px-6">
      <div className="min-w-0 flex-1 basis-64">
        <Heading className="m-0 text-[22px] leading-snug font-semibold tracking-[-0.025em] break-words text-[var(--bi-fg)]">
          {title}
        </Heading>
        <p className="mt-1.5 mb-0 max-w-[75ch] text-[13px] leading-relaxed text-[var(--bi-muted)]">
          {description}
        </p>
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
