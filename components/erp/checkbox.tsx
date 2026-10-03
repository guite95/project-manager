"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "checked" | "onChange" | "className" | "size"
>;

export type CheckboxProps = NativeProps & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 헤더 전체 선택처럼 일부만 선택된 상태. 표시만 바뀌고 `checked`는 그대로 전달한다. */
  indeterminate?: boolean;
  /** 눈에 보이는 라벨. 없으면 `aria-label`을 반드시 넘긴다. */
  label?: string;
  /** 표 셀처럼 라벨 없이 박스만 둘 때 접근성 이름 */
  ariaLabel?: string;
  className?: string;
};

/**
 * 프로젝트 공통 체크박스. 디자인 시스템(0.1.25)에는 독립 체크박스가 없고 `CheckTile`은
 * 폼 타일 전용이라, 표 셀·툴바에서 쓰는 단일 박스를 여기서 한 번만 정의한다.
 * 네이티브 `input`을 그대로 두고(키보드·폼·스크린리더 유지) 박스만 docs/ui-design.md 규격으로 그린다:
 * 16px, radius 3px, 1px 경계, 체크 시 accent 채움, 그림자 없음.
 */
export function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  label,
  ariaLabel,
  disabled,
  className,
  ...rest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  const visualChecked = checked || indeterminate;

  return (
    <label
      className={cn(
        "group/checkbox inline-flex max-w-full items-center gap-2 align-middle",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <input
        {...rest}
        aria-label={label ? undefined : ariaLabel}
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        ref={ref}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border transition-colors duration-[var(--bi-motion-fast)]",
          visualChecked
            ? "border-[var(--bi-accent)] bg-[var(--bi-accent)] text-white"
            : "border-[var(--bi-border)] bg-[var(--bi-card-bg)] text-transparent group-hover/checkbox:border-[var(--bi-muted)]",
          disabled &&
            (visualChecked
              ? "border-[var(--bi-sidebar-active)] bg-[var(--bi-sidebar-active)] text-[var(--bi-muted)]"
              : "border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] group-hover/checkbox:border-[var(--bi-border)]"),
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--bi-accent)]",
        )}
      >
        {indeterminate && !checked ? (
          <svg fill="none" height="10" viewBox="0 0 10 10" width="10">
            <path d="M2 5h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
        ) : (
          <svg fill="none" height="10" viewBox="0 0 10 10" width="10">
            <path
              d="M1.8 5.2 4 7.4l4.2-4.6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        )}
      </span>
      {label ? (
        <span
          className={cn(
            "min-w-0 truncate text-[13px] leading-none",
            disabled ? "text-[var(--bi-muted)]" : "text-[var(--bi-fg)]",
          )}
        >
          {label}
        </span>
      ) : null}
    </label>
  );
}
