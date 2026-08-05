import type { ReactNode } from "react";

export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol
      className="my-5 ml-0 list-none space-y-4 border-l border-[var(--bi-border)] pl-6"
      style={{ counterReset: "step" }}
    >
      {children}
    </ol>
  );
}

export function Step({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <li
      className="relative before:absolute before:-left-[31px] before:top-0 before:flex before:h-[22px] before:w-[22px] before:items-center before:justify-center before:rounded-full before:border before:border-[var(--bi-border-strong)] before:bg-[var(--bi-card-bg)] before:text-[11px] before:font-semibold before:text-[var(--bi-fg)] before:[content:counter(step)]"
      style={{ counterIncrement: "step" }}
    >
      {title ? (
        <div className="mb-1 text-[13px] font-semibold text-[var(--bi-fg)]">
          {title}
        </div>
      ) : null}
      <div className="text-[13px] leading-[1.7] text-[var(--bi-fg)] [&>p]:my-1.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:my-1.5">
        {children}
      </div>
    </li>
  );
}
