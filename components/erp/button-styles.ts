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
    "bg-[var(--bi-card-bg)] text-[var(--bi-fg)] border border-[var(--bi-control-border)] hover:bg-[var(--bi-table-header)] active:bg-[var(--bi-sidebar-active)]",
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
  sm: "min-h-8 px-2.5 py-1 text-xs font-medium",
  md: "min-h-9 px-3 py-1.5 text-[13px] font-semibold",
  "icon-sm": "bi-button-icon h-8 w-8 shrink-0 p-0 text-xs",
  "icon-md": "bi-button-icon h-9 w-9 shrink-0 p-0 text-sm",
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
    "bi-button inline-flex items-center justify-center gap-1.5 rounded-[var(--bi-radius-control)] leading-5 outline-none",
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
