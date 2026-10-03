"use client";

import type { ReactNode } from "react";

export type SegmentedFilterItem = {
  key: string;
  label: ReactNode;
  /** 라벨 뒤 건수 배지. 0도 그대로 보여 "해당 단계 0건"을 명시한다. 숨기려면 undefined. */
  count?: number;
  disabled?: boolean;
  title?: string;
};

export type SegmentedFilterProps = {
  items: readonly SegmentedFilterItem[];
  /** 선택된 항목 key. 아무것도 선택하지 않은 상태는 null. */
  value: string | null;
  onChange: (next: string | null) => void;
  /** 스크린리더용 그룹 이름. 무엇을 거르는 토글인지 항상 명시한다. */
  "aria-label": string;
  /** true면 선택된 항목을 다시 눌러 선택을 해제할 수 있다(단계 필터처럼 "전체" 항목이 없는 그룹). */
  clearable?: boolean;
};

// 목록 필터는 공통 입력창과 높이를 맞추고, 좁은 화면에서는 항목을 줄바꿈한다.
export function SegmentedFilter({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
  clearable = false,
}: SegmentedFilterProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex max-w-full flex-wrap items-center gap-px rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-table-header)] p-[2px]"
      role="group"
    >
      {items.map((item) => {
        const active = item.key === value;

        return (
          <button
            aria-pressed={active}
            className={[
              "inline-flex min-h-11 items-center md:min-h-[30px] gap-[5px] whitespace-nowrap rounded-[3px] border px-[9px] text-[12px] transition-colors duration-[var(--bi-motion-fast)]",
              active
                ? "border-[var(--bi-border)] bg-[var(--bi-card-bg)] font-semibold text-[var(--bi-accent)]"
                : "border-transparent bg-transparent font-medium text-[var(--bi-muted)] hover:text-[var(--bi-fg)]",
              item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            ].join(" ")}
            disabled={item.disabled}
            key={item.key}
            onClick={() => {
              if (active) {
                if (clearable) onChange(null);
                return;
              }
              onChange(item.key);
            }}
            title={item.title}
            type="button"
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={[
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-[999px] border border-[var(--bi-border)] px-1 text-[10px] font-bold leading-none tabular-nums",
                  active
                    ? "bg-[var(--bi-table-header)] text-[var(--bi-fg)]"
                    : "bg-white text-[var(--bi-muted)]",
                ].join(" ")}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** 토글 그룹 사이 세로 구분선 */
export function SegmentedFilterDivider() {
  return <span aria-hidden="true" className="h-[22px] w-px shrink-0 bg-[var(--bi-border)]" />;
}
