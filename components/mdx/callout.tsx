import type { ReactNode } from "react";
import {
  HiOutlineExclamationCircle,
  HiOutlineInformationCircle,
  HiOutlineLightBulb,
  HiOutlineXCircle,
} from "react-icons/hi";

type CalloutVariant = "info" | "tip" | "warn" | "danger";

const VARIANT_STYLE: Record<
  CalloutVariant,
  {
    border: string;
    bg: string;
    iconColor: string;
    Icon: typeof HiOutlineInformationCircle;
  }
> = {
  info: {
    border: "border-[var(--bi-border-strong)]",
    bg: "bg-[var(--bi-sidebar-bg)]",
    iconColor: "text-[var(--bi-fg)]",
    Icon: HiOutlineInformationCircle,
  },
  tip: {
    border: "border-[var(--bi-success)]",
    bg: "bg-[#ecfdf5]",
    iconColor: "text-[var(--bi-success)]",
    Icon: HiOutlineLightBulb,
  },
  warn: {
    border: "border-[var(--bi-warning)]",
    bg: "bg-[#fff7ed]",
    iconColor: "text-[var(--bi-warning)]",
    Icon: HiOutlineExclamationCircle,
  },
  danger: {
    border: "border-[var(--bi-error)]",
    bg: "bg-[#fef2f2]",
    iconColor: "text-[var(--bi-error)]",
    Icon: HiOutlineXCircle,
  },
};

export function Callout({
  variant = "info",
  title,
  children,
}: {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
}) {
  const style = VARIANT_STYLE[variant];
  const Icon = style.Icon;
  return (
    <div
      className={`my-4 flex gap-2.5 rounded-[3px] border ${style.border} ${style.bg} px-3 py-2.5`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${style.iconColor}`} />
      <div className="min-w-0 flex-1">
        {title ? (
          <div className="mb-1 text-[12px] font-semibold text-[var(--bi-fg)]">
            {title}
          </div>
        ) : null}
        <div className="text-[13px] leading-[1.6] text-[var(--bi-fg)] [&>p]:my-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  );
}
