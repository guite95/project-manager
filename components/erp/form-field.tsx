"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { DatePicker } from "./date-picker";
import { Checkbox } from "./checkbox";
import { cn } from "./cn";
import { Dropdown } from "./dropdown";

const inputClass =
  "bi-control h-9 min-w-0 w-full rounded-[4px] border border-[var(--bi-control-border)] bg-[var(--bi-card-bg)] px-3 text-[13px] outline-none focus:border-[var(--bi-accent)] disabled:bg-[var(--bi-sidebar-bg)] disabled:cursor-not-allowed";

/** 기존 label·인라인 편집·폼 제출 속성과 조합하는 공통 입력 요소. */
export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn("bi-control min-w-0 w-full rounded-[4px] border border-[var(--bi-control-border)] bg-[var(--bi-card-bg)] px-3 py-2 text-[13px] leading-7 outline-none focus:border-[var(--bi-accent)] disabled:bg-[var(--bi-sidebar-bg)] disabled:cursor-not-allowed", className)} />;
}

export function FieldLabel({
  label,
  children,
  error,
  errorId,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  errorId?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-[var(--bi-fg)]">
        {label}
      </span>
      {children}
      {error ? (
        <p id={errorId} className="mt-1 text-[12px] text-[var(--bi-error)]">{error}</p>
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
      <span className="text-[12px] font-medium text-[var(--bi-fg)]">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-[12px] text-[var(--bi-error)]">{error}</p> : null}
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
  type?: "text" | "search" | "number" | "date" | "datetime-local";
  autoFocus?: boolean;
  maxLength?: number;
  /** type="date" 전용. YYYY-MM-DD 이전 날짜 선택을 막는다. */
  minDate?: string;
  /** type="number" 전용. 소수 수량처럼 1 단위가 아닌 값의 스피너·검증 간격. */
  step?: string;
  /** 모바일 키패드 힌트. 금액처럼 text 입력으로 숫자를 받을 때 numeric을 준다. */
  inputMode?: "numeric" | "decimal";
}) {
  const errorId = useId();
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
    <FieldLabel error={props.error} errorId={errorId} label={props.label}>
      <TextInput
        aria-invalid={Boolean(props.error) || undefined}
        aria-describedby={props.error ? errorId : undefined}
        autoFocus={props.autoFocus}
        className="mt-1.5"
        data-autofocus={props.autoFocus ? "true" : undefined}
        disabled={props.disabled}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
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
      <span className="text-[12px] font-medium text-[var(--bi-fg)]">
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
        <p className="mt-1 text-[12px] text-[var(--bi-error)]">{props.error}</p>
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
  return <Checkbox {...props} />;
}
