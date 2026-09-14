"use client";

import type { ReactNode } from "react";
import { DatePicker } from "./date-picker";
import { cn } from "./cn";
import { Dropdown } from "./dropdown";

const inputClass =
  "mt-1 h-[30px] w-full rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 text-[12px] outline-none focus:border-[var(--bi-accent)] disabled:bg-[var(--bi-sidebar-bg)]";

export function FieldLabel({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium tracking-[0.02em] text-[var(--bi-muted)]">
        {label}
      </span>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] text-[var(--bi-error)]">{error}</p>
      ) : null}
    </label>
  );
}

/**
 * DatePicker 전용 라벨 래퍼. FieldLabel 과 달리 `<label>` 이 아니라 `<div>` 를 쓴다 —
 * DatePicker 트리거는 `<button>` 이라 `<label>` 안에 두면 라벨 클릭이 팝오버를 다시 토글한다.
 */
function DateFieldLabel({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="block">
      <span className="text-[11px] font-medium tracking-[0.02em] text-[var(--bi-muted)]">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-[11px] text-[var(--bi-error)]">{error}</p> : null}
    </div>
  );
}

export function DateField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  /** 값을 비울 수 있게 '지우기'를 노출한다. 필수 입력이면 false. */
  clearable?: boolean;
  /** YYYY-MM-DD. 이 날짜보다 이전은 선택할 수 없다. */
  minDate?: string;
  /** 같은 라벨의 행이 반복될 때 행마다 고유한 접근성 이름을 준다. 기본은 label. */
  ariaLabel?: string;
}) {
  return (
    <DateFieldLabel error={props.error} label={props.label}>
      <DatePicker
        ariaLabel={props.ariaLabel ?? props.label}
        clearable={props.clearable}
        disabled={props.disabled}
        error={Boolean(props.error)}
        minDate={props.minDate}
        onChange={props.onChange}
        placeholder={props.placeholder}
        value={props.value}
      />
    </DateFieldLabel>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  type?: "text" | "number" | "date" | "datetime-local";
  autoFocus?: boolean;
  /** type="date" 전용. YYYY-MM-DD 이전 날짜 선택을 막는다. */
  minDate?: string;
  /** type="number" 전용. 소수 수량처럼 1 단위가 아닌 값의 스피너·검증 간격. */
  step?: string;
  /** 모바일 키패드 힌트. 금액처럼 text 입력으로 숫자를 받을 때 numeric을 준다. */
  inputMode?: "numeric" | "decimal";
}) {
  // 날짜는 브라우저별 native date input 대신 공통 DatePicker 로 통일한다.
  if (props.type === "date") {
    return (
      <DateField
        clearable={!props.required}
        disabled={props.disabled}
        error={props.error}
        label={props.label}
        minDate={props.minDate}
        onChange={props.onChange}
        placeholder={props.placeholder}
        value={props.value}
      />
    );
  }
  return (
    <FieldLabel error={props.error} label={props.label}>
      <input
        autoFocus={props.autoFocus}
        className={inputClass}
        data-autofocus={props.autoFocus ? "true" : undefined}
        disabled={props.disabled}
        inputMode={props.inputMode}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        step={props.step}
        type={props.type ?? "text"}
        value={props.value}
      />
    </FieldLabel>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  allowEmpty?: boolean;
  searchable?: boolean;
  disabled?: boolean;
}) {
  const options = props.allowEmpty
    ? [{ value: "", label: "선택 안 함" }, ...props.options]
    : props.options;
  return (
    <div className="block">
      <span className="text-[11px] font-medium tracking-[0.02em] text-[var(--bi-muted)]">
        {props.label}
      </span>
      <div className="mt-1">
        <Dropdown
          ariaLabel={props.label}
          disabled={props.disabled}
          error={Boolean(props.error)}
          onChange={props.onChange}
          options={options}
          searchable={props.searchable}
          value={props.value}
        />
      </div>
      {props.error ? (
        <p className="mt-1 text-[11px] text-[var(--bi-error)]">{props.error}</p>
      ) : null}
    </div>
  );
}

export function CheckboxField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "group inline-flex items-center gap-2 text-[12px]",
        props.disabled
          ? "cursor-not-allowed text-[var(--bi-muted)]"
          : "cursor-pointer"
      )}
    >
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          checked={props.checked}
          className="peer absolute inset-0 h-full w-full cursor-[inherit] opacity-0"
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.checked)}
          type="checkbox"
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex h-4 w-4 items-center justify-center rounded-[3px] border transition-colors",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-[var(--bi-accent)]",
            props.checked
              ? "border-[var(--bi-accent)] bg-[var(--bi-accent)]"
              : "border-[var(--bi-border)] bg-[var(--bi-bg)] group-hover:border-[var(--bi-accent)]",
            props.disabled && "opacity-45"
          )}
        >
          <svg
            className={cn(
              "text-white transition-opacity",
              props.checked ? "opacity-100" : "opacity-0"
            )}
            fill="none"
            height="10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
            width="10"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      </span>
      {props.label}
    </label>
  );
}
