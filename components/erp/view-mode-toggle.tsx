"use client";

import type { ReactNode } from "react";

export type ViewModeItem<T extends string> = {
  key: T;
  /** 툴팁·스크린리더용 이름(예: "표", "보드") */
  label: string;
  icon: ReactNode;
};

export type ViewModeToggleProps<T extends string> = {
  items: readonly ViewModeItem<T>[];
  value: T;
  onChange: (next: T) => void;
  "aria-label": string;
  /** 아이콘 옆에 라벨을 함께 보인다. 툴바에 보기 전환만 남는 화면에서 쓴다. */
  showLabel?: boolean;
};

// 목록 보기 방식(표·보드) 전환. SegmentedFilter와 같은 트랙·pill 규격을 쓴다.
// 기본은 아이콘만 보여 툴바 폭을 아끼고, showLabel을 켜면 라벨을 함께 보인다
// — 보기 전환이 툴바 첫 요소로 올라와 스스로를 설명해야 하는 화면용이다.
export function ViewModeToggle<T extends string>({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
  showLabel = false,
}: ViewModeToggleProps<T>) {
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-px rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-table-header)] p-[2px]"
      role="group"
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            aria-label={item.label}
            aria-pressed={active}
            className={[
              "inline-flex h-[25px] items-center justify-center gap-1 rounded-[3px] border transition-colors duration-[var(--bi-motion-fast)]",
              showLabel ? "px-2 text-[12px] font-semibold" : "w-[30px]",
              active
                ? "border-[var(--bi-border)] bg-white text-[var(--bi-fg)]!"
                : "cursor-pointer border-transparent bg-transparent text-[var(--bi-muted)]! hover:text-[var(--bi-fg)]!",
            ].join(" ")}
            key={item.key}
            onClick={() => {
              if (!active) onChange(item.key);
            }}
            title={item.label}
            type="button"
          >
            {item.icon}
            {showLabel ? <span>{item.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
