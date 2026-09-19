export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "subtle"
  | "destructive"
  | "danger-ghost";

export type ButtonSize = "sm" | "md" | "icon-sm" | "icon-md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--bi-accent)] text-white hover:brightness-95 active:brightness-90",
  secondary:
    "bg-[var(--bi-bg)] text-[var(--bi-fg)] border border-[var(--bi-border)] hover:bg-[var(--bi-table-header)]",
  ghost:
    "bg-transparent text-[var(--bi-accent)] hover:bg-[var(--bi-accent-light)]",
  subtle:
    "bg-transparent text-[var(--bi-muted)] hover:bg-[var(--bi-accent-light)] hover:text-[var(--bi-accent)]",
  destructive:
    "bg-[var(--bi-error)] text-white hover:brightness-95 active:brightness-90",
  "danger-ghost":
    "bg-transparent text-[var(--bi-error)] hover:bg-[var(--bi-error)]/10",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-[26px] px-2.5 text-xs font-medium",
  md: "h-[30px] px-3 text-xs font-semibold",
  "icon-sm": "h-[26px] w-[26px] shrink-0 p-0 text-xs",
  "icon-md": "h-[30px] w-[30px] shrink-0 p-0 text-sm",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return [
    "inline-flex items-center justify-center gap-1 rounded-[4px] outline-none",
    "cursor-pointer transition-[color,background-color,filter] duration-[var(--bi-motion-fast)] ease-[var(--bi-ease)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bi-accent)]",
    "disabled:cursor-not-allowed disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
