import { cn } from "./cn";

export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block rounded-[4px] bg-[var(--bi-sidebar-active)] motion-safe:animate-pulse motion-reduce:animate-none",
        className,
      )}
    />
  );
}
