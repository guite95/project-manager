"use client";

import { Dropdown } from "./dropdown";

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <Dropdown
      ariaLabel={ariaLabel}
      disabled={disabled}
      onChange={onChange}
      options={options}
      value={value}
    />
  );
}
