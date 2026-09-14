import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeVariant =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "neutral"
  | "ai"
  | "demand"
  | "stockWarn";

const VARIANTS: Record<BadgeVariant, string> = {
  primary: "bg-[var(--bi-accent-light)] text-[var(--bi-accent)]",
  success: "bg-[var(--bi-success)]/15 text-[var(--bi-success)]",
  // warning 원색(#F5A623)은 흰 배경 텍스트 대비가 부족해 stock-warn 톤을 글자색으로 쓴다.
  warning: "bg-[var(--bi-warning)]/15 text-[var(--bi-stock-warn)]",
  error: "bg-[var(--bi-error)]/10 text-[var(--bi-error)]",
  neutral: "bg-[#f2f2f2] text-[var(--bi-muted)]",
  ai: "bg-[var(--bi-ai-light)] text-[var(--bi-ai)]",
  demand: "bg-[var(--bi-demand-light)] text-[var(--bi-demand)]",
  stockWarn: "bg-[var(--bi-stock-warn-light)] text-[var(--bi-stock-warn)]",
};

export function Badge({
  variant,
  children,
  title,
}: {
  variant: BadgeVariant;
  children: ReactNode;
  /**
   * 툴팁은 배지 요소에 직접 붙인다. 호출부에서 플레인 span으로 감싸면 그 span이
   * 부모 글꼴(16px) 기준 줄상자를 만들어 옆 배지와 세로 위치·높이가 어긋난다.
   */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold",
        VARIANTS[variant],
      )}
    >
      {children}
    </span>
  );
}
