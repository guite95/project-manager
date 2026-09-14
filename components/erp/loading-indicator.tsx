import { cn } from "./cn";

type LoadingIndicatorSize = "sm" | "md" | "lg";

const SIZES: Record<LoadingIndicatorSize, { icon: string; text: string }> = {
  sm: { icon: "h-3 w-3", text: "text-[11px]" },
  md: { icon: "h-4 w-4", text: "text-xs" },
  lg: { icon: "h-5 w-5", text: "text-xs" },
};

export function LoadingIndicator({
  size = "sm",
  label = "불러오는 중…",
  showLabel = true,
  announce = true,
  className,
}: {
  size?: LoadingIndicatorSize;
  label?: string;
  showLabel?: boolean;
  announce?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-label={announce ? label : undefined}
      aria-live={announce ? "polite" : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        SIZES[size].text,
        className,
      )}
      role={announce ? "status" : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block shrink-0 rounded-full border-[1.5px] border-current border-r-transparent motion-safe:animate-spin motion-reduce:animate-none",
          SIZES[size].icon,
        )}
      />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
