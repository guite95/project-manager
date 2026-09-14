"use client";

import {
  activeFilterChips,
  clearAllFilters,
  clearFilterKeys,
  type FilterGroupSpec,
  type FilterValues,
} from "@/lib/filters/filter-spec";

/**
 * 적용된 필터를 툴바에 칩으로 보여준다.
 *
 * 칩 조작은 즉시 반영한다 — 칩은 '이미 적용된 값'이라 지우는 데 다시 [적용]을
 * 요구하면 동작이 어긋난다. 패널 안 조작만 draft 다.
 */
export function FilterChips<K extends string>({
  groups,
  value,
  onChange,
  onOverflowClick,
  maxVisible = 4,
}: {
  groups: FilterGroupSpec<K>[];
  value: FilterValues<K>;
  onChange: (next: FilterValues<K>) => void;
  /** 넘친 칩의 "+N" 을 눌렀을 때. 보통 패널을 연다. */
  onOverflowClick?: () => void;
  maxVisible?: number;
}) {
  const chips = activeFilterChips(groups, value);
  if (chips.length === 0) return null;

  const visible = chips.slice(0, maxVisible);
  const hiddenCount = chips.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {visible.map((chip) => (
        <span
          className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-bg)] py-0 pl-2 pr-1 text-[11px]"
          key={chip.id}
        >
          <span className="text-[var(--bi-muted)]">{chip.label}</span>
          <span className="max-w-[160px] truncate font-semibold text-[var(--bi-accent)]">
            {chip.valueLabel}
          </span>
          <button
            aria-label={`${chip.label} 필터 해제`}
            className="inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-[3px] text-[var(--bi-muted)] outline-none hover:bg-[var(--bi-table-header)] hover:text-[var(--bi-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]"
            onClick={() => onChange(clearFilterKeys(value, chip.clears))}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="10"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="10"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}

      {hiddenCount > 0 ? (
        <button
          className="h-[26px] shrink-0 cursor-pointer rounded-[3px] border border-[var(--bi-border)] px-2 text-[11px] text-[var(--bi-muted)] outline-none hover:bg-[var(--bi-table-header)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]"
          onClick={onOverflowClick}
          type="button"
        >
          +{hiddenCount}
        </button>
      ) : null}

      <button
        className="shrink-0 cursor-pointer px-1 text-[11px] text-[var(--bi-accent)] outline-none hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]"
        onClick={() => onChange(clearAllFilters(groups, value))}
        type="button"
      >
        전체 해제
      </button>
    </div>
  );
}
