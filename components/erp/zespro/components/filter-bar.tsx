"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/class-names";

export type FilterBarProps = {
  children: ReactNode;
  trailing?: ReactNode;
  wrap?: boolean;
  bordered?: boolean;
  className?: string;
};

export function FilterBar({ children, trailing, wrap = false, bordered = true, className }: FilterBarProps) {
  return (
    <div className={cx("pds", "pds-filter-bar", wrap && "pds-filter-bar--wrap", bordered && "pds-filter-bar--bordered", className)}>
      {children}
      {trailing ? <div className="pds-filter-bar__trailing">{trailing}</div> : null}
    </div>
  );
}

export type FilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: "neutral" | "accent" | "info";
  size?: "medium" | "small";
  shape?: "pill" | "square";
};

export function FilterButton({
  active = false,
  tone = "neutral",
  size = "medium",
  shape = "pill",
  type = "button",
  className,
  ...props
}: FilterButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        "pds-filter-button",
        `pds-filter-button--${tone}`,
        `pds-filter-button--${size}`,
        `pds-filter-button--${shape}`,
        active && "is-active",
        className
      )}
    />
  );
}

export function FilterSeparator({ children = "→" }: { children?: ReactNode }) {
  return <span className="pds-filter-separator">{children}</span>;
}

export function FilterMeta({ children }: { children: ReactNode }) {
  return <span className="pds-filter-meta">{children}</span>;
}

export type FilterSearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** 왼쪽 아이콘 슬롯 (소비 프로젝트의 아이콘 세트를 그대로 쓴다) */
  icon?: ReactNode;
  width?: number | string;
};

/** 목록 상단 검색 인풋. 화면마다 인라인 style로 만들던 input을 대체한다. */
export function FilterSearchInput({ icon, width = 260, className, style, ...props }: FilterSearchInputProps) {
  return (
    <span className={cx("pds-filter-search", className)} style={{ width, ...style }}>
      {icon ? <span className="pds-filter-search__icon">{icon}</span> : null}
      <input {...props} type={props.type ?? "search"} className={cx("pds-filter-search__input", icon ? "has-icon" : null)} />
    </span>
  );
}
