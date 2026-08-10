"use client";

import { Dropdown } from "./dropdown";

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <Dropdown
      ariaLabel={ariaLabel}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={onChange}
      options={options}
      value={value}
    />
  );
}
