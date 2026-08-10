"use client";

import type { ReactNode } from "react";
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

export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  type?: "text" | "number" | "date";
}) {
  return (
    <FieldLabel error={props.error} label={props.label}>
      <input
        className={inputClass}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required={props.required}
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
    <FieldLabel error={props.error} label={props.label}>
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
    </FieldLabel>
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
