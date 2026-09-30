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

// 목록 상단 세그먼트 토글. 옅은 트랙(--bi-table-header) 안에 pill 버튼을 놓고
// 트랙 높이(25 + 2*2 + 경계 2 = 31px)는 FilterBar 표준 44px(패딩 12 + 경계 1) 안에 맞춘다.
// 활성 항목만 흰 배경 + 1px 경계로 올린다. DESIGN.md: 그림자 없음, radius 0~4px.
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
      className="inline-flex shrink-0 items-center gap-px rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-table-header)] p-[2px]"
      role="group"
    >
      {items.map((item) => {
        const active = item.key === value;

        return (
          <button
            aria-pressed={active}
            className={[
              "inline-flex h-[25px] items-center gap-[5px] whitespace-nowrap rounded-[3px] border px-[9px] text-[12px] transition-colors duration-[var(--bi-motion-fast)]",
              // .pds button { color: inherit } 리셋이 unlayered라 utilities를 덮으므로 글자색은 !로 강제한다
              active
                ? "border-[var(--bi-border)] bg-white font-extrabold text-[var(--bi-fg)]!"
                : "border-transparent bg-transparent font-semibold text-[var(--bi-muted)]! hover:text-[var(--bi-fg)]!",
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
