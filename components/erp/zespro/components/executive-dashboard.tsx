"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/class-names";

export type ExecutiveDashboardProps = HTMLAttributes<HTMLDivElement>;

export function ExecutiveDashboard({ className, ...props }: ExecutiveDashboardProps) {
  return <div {...props} className={cx("pds", "pds-executive-dashboard", className)} />;
}

export type ExecutiveDashboardNoticeProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  tone?: "neutral" | "info" | "warning";
};

export function ExecutiveDashboardNotice({
  icon,
  tone = "warning",
  className,
  children,
  role = "note",
  ...props
}: ExecutiveDashboardNoticeProps) {
  return (
    <div
      {...props}
      role={role}
      className={cx("pds-executive-dashboard__notice", `pds-executive-dashboard__notice--${tone}`, className)}
    >
      {icon ? <span className="pds-executive-dashboard__notice-icon" aria-hidden="true">{icon}</span> : null}
      <span className="pds-executive-dashboard__notice-copy">{children}</span>
    </div>
  );
}

export type ExecutiveDashboardToolbarProps = HTMLAttributes<HTMLElement> & {
  leading?: ReactNode;
  trailing?: ReactNode;
  ariaLabel?: string;
};

export function ExecutiveDashboardToolbar({
  leading,
  trailing,
  ariaLabel = "대시보드 조회 조건",
  className,
  children,
  ...props
}: ExecutiveDashboardToolbarProps) {
  return (
    <section
      {...props}
      aria-label={ariaLabel}
      className={cx("pds-executive-dashboard__toolbar", className)}
    >
      <div className="pds-executive-dashboard__toolbar-leading">{leading ?? children}</div>
      {trailing ? <div className="pds-executive-dashboard__toolbar-trailing">{trailing}</div> : null}
    </section>
  );
}

export type ExecutiveDashboardKpiGridProps = HTMLAttributes<HTMLElement> & {
  columns?: 3 | 4 | 5;
  ariaLabel?: string;
};

export function ExecutiveDashboardKpiGrid({
  columns = 4,
  ariaLabel = "핵심 지표",
  className,
  ...props
}: ExecutiveDashboardKpiGridProps) {
  return (
    <section
      {...props}
      aria-label={ariaLabel}
      className={cx(
        "pds-executive-dashboard__kpis",
        `pds-executive-dashboard__kpis--${columns}`,
        className
      )}
    />
  );
}

export type ExecutiveDashboardKpiProps = HTMLAttributes<HTMLElement> & {
  label: ReactNode;
  value: ReactNode;
  status?: ReactNode;
  note?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  hero?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
};

export function ExecutiveDashboardKpi({
  label,
  value,
  status,
  note,
  badge,
  action,
  hero = false,
  tone = "default",
  className,
  ...props
}: ExecutiveDashboardKpiProps) {
  return (
    <article
      {...props}
      className={cx(
        "pds-executive-dashboard__kpi",
        hero && "pds-executive-dashboard__kpi--hero",
        tone !== "default" && `pds-executive-dashboard__kpi--${tone}`,
        className
      )}
    >
      <header className="pds-executive-dashboard__kpi-header">
        <span className="pds-executive-dashboard__kpi-label">{label}</span>
        <span className="pds-executive-dashboard__kpi-header-end">{status}{action}</span>
      </header>
      <strong className="pds-executive-dashboard__kpi-value">{value}</strong>
      {badge ? <span className="pds-executive-dashboard__kpi-badge">{badge}</span> : null}
      {note ? <span className="pds-executive-dashboard__kpi-note">{note}</span> : null}
    </article>
  );
}

export type ExecutiveDashboardSplitProps = HTMLAttributes<HTMLDivElement> & {
  ratio?: "2:1" | "3:2" | "1:1";
};

export function ExecutiveDashboardSplit({
  ratio = "2:1",
  className,
  ...props
}: ExecutiveDashboardSplitProps) {
  return (
    <div
      {...props}
      className={cx(
        "pds-executive-dashboard__split",
        `pds-executive-dashboard__split--${ratio.replace(":", "-")}`,
        className
      )}
    />
  );
}

export type ExecutiveDashboardSectionProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: "default" | "dark";
};

export function ExecutiveDashboardSection({
  title,
  description,
  actions,
  tone = "default",
  className,
  children,
  ...props
}: ExecutiveDashboardSectionProps) {
  return (
    <section
      {...props}
      className={cx(
        "pds-executive-dashboard__section",
        tone === "dark" && "pds-executive-dashboard__section--dark",
        className
      )}
    >
      <header className="pds-executive-dashboard__section-header">
        <div className="pds-executive-dashboard__section-copy">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="pds-executive-dashboard__section-actions">{actions}</div> : null}
      </header>
      <div className="pds-executive-dashboard__section-body">{children}</div>
    </section>
  );
}

export type ExecutiveDashboardProgressProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: number;
  displayValue?: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger";
};

export function ExecutiveDashboardProgress({
  label,
  value,
  displayValue,
  tone = "accent",
  className,
  ...props
}: ExecutiveDashboardProgressProps) {
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <div {...props} className={cx("pds-executive-dashboard__progress", className)}>
      <div className="pds-executive-dashboard__progress-meta">
        <span>{label}</span>
        <strong>{displayValue ?? `${safeValue.toFixed(1)}%`}</strong>
      </div>
      <div
        className="pds-executive-dashboard__progress-track"
        role="progressbar"
        aria-label={typeof label === "string" ? label : "진행률"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safeValue)}
      >
        <i className={`pds-executive-dashboard__progress-bar pds-executive-dashboard__progress-bar--${tone}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}
