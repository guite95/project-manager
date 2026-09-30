"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/class-names";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "medium" | "small" | "large";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 아이콘 슬롯 — 라벨 앞/뒤 */
  iconBefore?: ReactNode;
  iconAfter?: ReactNode;
  /** 아이콘만 있는 정사각 버튼 */
  iconOnly?: boolean;
  block?: boolean;
};

/**
 * 업무 화면 표준 버튼. 소비 프로젝트가 화면마다 인라인 style로 만들던
 * "accent 배경 + 흰 글씨" / "테두리만" 버튼을 대체한다.
 */
export function Button({
  variant = "secondary",
  size = "medium",
  iconBefore,
  iconAfter,
  iconOnly = false,
  block = false,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        "pds",
        "pds-button",
        `pds-button--${variant}`,
        `pds-button--${size}`,
        iconOnly && "pds-button--icon-only",
        block && "pds-button--block",
        className
      )}
    >
      {iconBefore ? <span className="pds-button__icon">{iconBefore}</span> : null}
      {children ? <span className="pds-button__label">{children}</span> : null}
      {iconAfter ? <span className="pds-button__icon">{iconAfter}</span> : null}
    </button>
  );
}
