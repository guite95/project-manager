"use client";

import type { ButtonHTMLAttributes } from "react";
import {
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";
import { LoadingIndicator } from "./loading-indicator";

export type { ButtonSize, ButtonVariant } from "./button-styles";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-busy={loading || undefined}
      className={buttonClassName({ className, size, variant })}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? (
        <>
          <LoadingIndicator
            announce={false}
            label="처리 중"
            showLabel={false}
          />
          <span>처리 중…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
