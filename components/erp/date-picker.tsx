"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiOutlineCalendarDays,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from "react-icons/hi2";
import { todayInSeoul } from "@/lib/format/date-time";
import { cn } from "./cn";
import { useAnchoredPopover, useDismiss } from "./use-anchored-popover";

// 서울 기준 오늘은 서버 검증과 같은 기준을 써야 하므로 lib/format/date-time 의 것을
// 그대로 재노출한다. 기존 import 경로를 유지하기 위한 re-export이며 구현은 두지 않는다.
export { todayInSeoul };

// ---- 모드 ----
export type DateRangeMode = "day" | "week" | "month" | "quarter" | "year";
const ALL_MODES: DateRangeMode[] = ["day", "week", "month", "quarter", "year"];
const MODE_LABEL: Record<DateRangeMode, string> = {
  day: "일",
  week: "주",
  month: "월",
  quarter: "분기",
  year: "연",
};

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

// ---- 순수 날짜 헬퍼 ----
function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toYmd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromYmd(value: string | undefined) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // 2026-02-31 처럼 넘침으로 보정되는 값을 걸러낸다.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// 월요일 시작 주.
function startOfWeek(date: Date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function startOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}

function endOfQuarter(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3 + 3, 0);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function quarterOf(date: Date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

// ---- 프리셋: 각 항목은 오늘 기준 [from, to] 범위를 계산 ----
type Preset = { label: string; range: (today: Date) => { from: Date; to: Date } };

const DAY_PRESETS: Preset[] = [
  { label: "오늘", range: (t) => ({ from: t, to: t }) },
  { label: "어제", range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }) },
  { label: "최근 7일", range: (t) => ({ from: addDays(t, -6), to: t }) },
  { label: "최근 30일", range: (t) => ({ from: addDays(t, -29), to: t }) },
  { label: "이번 달", range: (t) => ({ from: startOfMonth(t), to: endOfMonth(t) }) },
  {
    label: "올해",
    range: (t) => ({
      from: new Date(t.getFullYear(), 0, 1),
      to: new Date(t.getFullYear(), 11, 31),
    }),
  },
];

const WEEK_PRESETS: Preset[] = [
  { label: "이번 주", range: (t) => ({ from: startOfWeek(t), to: endOfWeek(t) }) },
  {
    label: "지난 주",
    range: (t) => ({ from: startOfWeek(addDays(t, -7)), to: endOfWeek(addDays(t, -7)) }),
  },
  { label: "지난 4주", range: (t) => ({ from: startOfWeek(addDays(t, -21)), to: endOfWeek(t) }) },
  { label: "지난 12주", range: (t) => ({ from: startOfWeek(addDays(t, -77)), to: endOfWeek(t) }) },
];

const MONTH_PRESETS: Preset[] = [
  { label: "이번 달", range: (t) => ({ from: startOfMonth(t), to: endOfMonth(t) }) },
  {
    label: "지난 달",
    range: (t) => ({ from: startOfMonth(addMonths(t, -1)), to: endOfMonth(addMonths(t, -1)) }),
  },
  { label: "지난 3개월", range: (t) => ({ from: startOfMonth(addMonths(t, -2)), to: endOfMonth(t) }) },
  {
    label: "올해",
    range: (t) => ({
      from: new Date(t.getFullYear(), 0, 1),
      to: new Date(t.getFullYear(), 11, 31),
    }),
  },
];

const QUARTER_PRESETS: Preset[] = [
  { label: "이번 분기", range: (t) => ({ from: startOfQuarter(t), to: endOfQuarter(t) }) },
  {
    label: "지난 분기",
    range: (t) => ({
      from: startOfQuarter(addMonths(t, -3)),
      to: endOfQuarter(addMonths(t, -3)),
    }),
  },
  {
    label: "올해",
    range: (t) => ({
      from: new Date(t.getFullYear(), 0, 1),
      to: new Date(t.getFullYear(), 11, 31),
    }),
  },
  {
    label: "작년",
    range: (t) => ({
      from: new Date(t.getFullYear() - 1, 0, 1),
      to: new Date(t.getFullYear() - 1, 11, 31),
    }),
  },
];

const YEAR_PRESETS: Preset[] = [
  {
    label: "올해",
    range: (t) => ({
      from: new Date(t.getFullYear(), 0, 1),
      to: new Date(t.getFullYear(), 11, 31),
    }),
  },
  {
    label: "작년",
    range: (t) => ({
      from: new Date(t.getFullYear() - 1, 0, 1),
      to: new Date(t.getFullYear() - 1, 11, 31),
    }),
  },
  {
    label: "지난 2년",
    range: (t) => ({
      from: new Date(t.getFullYear() - 1, 0, 1),
      to: new Date(t.getFullYear(), 11, 31),
    }),
  },
];

const PRESETS: Record<DateRangeMode, Preset[]> = {
  day: DAY_PRESETS,
  week: WEEK_PRESETS,
  month: MONTH_PRESETS,
  quarter: QUARTER_PRESETS,
  year: YEAR_PRESETS,
};

// 선택된 날짜를 모드 단위 경계로 확장한다(예: 월 모드는 그 달의 1일~말일).
function expandStart(mode: DateRangeMode, date: Date): Date {
  switch (mode) {
    case "week":
      return startOfWeek(date);
    case "month":
      return startOfMonth(date);
    case "quarter":
      return startOfQuarter(date);
    case "year":
      return new Date(date.getFullYear(), 0, 1);
    default:
      return date;
  }
}

function expandEnd(mode: DateRangeMode, date: Date): Date {
  switch (mode) {
    case "week":
      return endOfWeek(date);
    case "month":
      return endOfMonth(date);
    case "quarter":
      return endOfQuarter(date);
    case "year":
      return new Date(date.getFullYear(), 11, 31);
    default:
      return date;
  }
}

function formatUnit(mode: DateRangeMode, value: string) {
  const date = fromYmd(value);
  if (!date) return value;
  switch (mode) {
    case "month":
      return `${date.getFullYear()}. ${pad(date.getMonth() + 1)}`;
    case "quarter":
      return `${date.getFullYear()} ${quarterOf(date)}Q`;
    case "year":
      return `${date.getFullYear()}`;
    default:
      return value;
  }
}

// ---- 공통 클래스 (DESIGN.md: 0~4px radius, flat, --bi-* 토큰) ----
const triggerClass =
  "inline-flex h-[30px] min-w-0 max-w-full items-center gap-1.5 rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 text-xs tabular-nums text-[var(--bi-fg)] outline-none focus:border-[var(--bi-accent)] disabled:bg-[var(--bi-sidebar-bg)] disabled:text-[var(--bi-muted)]";

const popoverClass =
  "fixed z-50 flex flex-col overflow-hidden rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)]";

const modeGroupClass =
  "inline-flex items-center gap-px rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-table-header)] p-px";

const modePillBase =
  "inline-flex h-[26px] items-center rounded-[3px] px-2.5 text-[11px] font-medium whitespace-nowrap";

const presetChipClass =
  "h-[24px] rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-table-header)] px-2 text-[11px] whitespace-nowrap text-[var(--bi-fg)] hover:bg-[var(--bi-sidebar-active)]";

const navButtonClass =
  "inline-flex h-[24px] w-[24px] items-center justify-center rounded-[4px] text-[var(--bi-muted)] hover:bg-[var(--bi-table-header)]";

const footerGhostClass =
  "h-[28px] rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-bg)] px-3 text-[11px] font-medium text-[var(--bi-fg)] hover:bg-[var(--bi-table-header)]";

const footerPrimaryClass =
  "h-[28px] rounded-[4px] bg-[var(--bi-accent)] px-4 text-[11px] font-medium text-white";

function ModePills({
  modes,
  mode,
  onSelect,
}: {
  modes: DateRangeMode[];
  mode: DateRangeMode | null;
  onSelect: (mode: DateRangeMode) => void;
}) {
  return (
    <div aria-label="기간 단위" className={modeGroupClass} role="group">
      {modes.map((value) => (
        <button
          aria-pressed={mode === value}
          className={cn(
            modePillBase,
            mode === value
              ? "bg-[var(--bi-bg)] text-[var(--bi-fg)]"
              : "text-[var(--bi-muted)] hover:text-[var(--bi-fg)]",
          )}
          key={value}
          onClick={() => onSelect(value)}
          type="button"
        >
          {MODE_LABEL[value]}
        </button>
      ))}
    </div>
  );
}

// ---- 시작/종료 탭 ----
type Editing = "from" | "to";

function RangeTabs({
  mode,
  from,
  to,
  editing,
  onEdit,
}: {
  mode: DateRangeMode;
  from: string;
  to: string;
  editing: Editing;
  onEdit: (which: Editing) => void;
}) {
  const tab = (which: Editing, label: string, value: string) => (
    <button
      aria-pressed={editing === which}
      className={cn(
        "flex min-w-0 flex-1 items-baseline gap-1.5 rounded-[4px] border px-2 py-1 text-left",
        editing === which
          ? "border-[var(--bi-accent)] bg-[var(--bi-accent-light)]"
          : "border-[var(--bi-border)] bg-[var(--bi-bg)]",
      )}
      onClick={() => onEdit(which)}
      type="button"
    >
      <span className="shrink-0 text-[10px] font-medium text-[var(--bi-muted)]">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-[11px] tabular-nums",
          value ? "text-[var(--bi-fg)]" : "text-[var(--bi-muted)]",
        )}
      >
        {value ? formatUnit(mode, value) : "선택"}
      </span>
    </button>
  );

  return (
    <div className="flex items-center gap-1 px-2 pb-1.5 pt-2">
      {tab("from", "시작", from)}
      <HiOutlineChevronRight
        aria-hidden="true"
        className="h-3 w-3 shrink-0 text-[var(--bi-muted)]"
      />
      {tab("to", "종료", to)}
    </div>
  );
}

function GridHeader({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-1.5">
      <button aria-label="이전" className={navButtonClass} onClick={onPrev} type="button">
        <HiOutlineChevronLeft aria-hidden="true" />
      </button>
      <span className="text-xs font-medium tabular-nums text-[var(--bi-fg)]">
        {label}
      </span>
      <button aria-label="다음" className={navButtonClass} onClick={onNext} type="button">
        <HiOutlineChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

/** 셀 상태에 따른 공통 강조 클래스 — 단일 선택과 범위 양끝 모두 endpoint 로 취급. */
function cellClass(options: {
  inRange: boolean;
  endpoint: boolean;
  isToday: boolean;
  outside?: boolean;
  disabled?: boolean;
  base: string;
}) {
  const { inRange, endpoint, isToday, outside, disabled, base } = options;
  // 선택 불가 셀은 강조·hover 없이 흐리게만 둔다 — 눌러도 반응이 없어야 한다.
  if (disabled) {
    return cn(base, "cursor-not-allowed text-[var(--bi-muted)] opacity-40");
  }
  return cn(
    base,
    outside && "text-[var(--bi-muted)]",
    inRange && !endpoint && "bg-[var(--bi-accent-light)]",
    isToday && !endpoint && "font-semibold text-[var(--bi-accent)]",
    endpoint && "bg-[var(--bi-accent)] font-semibold text-white",
    !endpoint && "hover:bg-[var(--bi-table-header)]",
  );
}

function buildMonthDays(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const lead = (first.getDay() + 6) % 7; // 월요일 시작
  const total = endOfMonth(month).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// 편집 기준: 시작이 있으면 시작, 없으면 종료로 달력을 맞춘다.
function editingAnchor(from: string, to: string) {
  return from || to || undefined;
}

type GridProps = {
  mode: DateRangeMode;
  from: string;
  to: string;
  today: Date;
  /** 이 날짜보다 이전은 선택할 수 없다(해당 날짜 자체는 선택 가능). 일 단위에만 적용. */
  minDate?: Date;
  onSelect: (value: Date) => void;
};

// 단일 월 달력(일/주). 이전/다음 달로 이동.
function DayGrid({ mode, from, to, today, minDate, onSelect }: GridProps) {
  const anchor = fromYmd(editingAnchor(from, to)) ?? today;
  const [cursor, setCursor] = useState(() => startOfMonth(anchor));

  const fromDate = fromYmd(from);
  const toDate = fromYmd(to);
  const cells = useMemo(() => buildMonthDays(cursor), [cursor]);

  return (
    <div className="px-2 pb-1 pt-2">
      <GridHeader
        label={`${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`}
        onNext={() => setCursor((current) => addMonths(current, 1))}
        onPrev={() => setCursor((current) => addMonths(current, -1))}
      />
      <div aria-hidden="true" className="grid grid-cols-7">
        {WEEKDAYS.map((weekday) => (
          <div
            className="flex h-[20px] items-center justify-center text-[10px] font-medium text-[var(--bi-muted)]"
            key={weekday}
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const value = toYmd(day);
          const isStart = Boolean(fromDate && isSameDay(day, fromDate));
          const isEnd = Boolean(toDate && isSameDay(day, toDate));
          const endpoint = isStart || isEnd;
          const disabled = Boolean(minDate && day < minDate);
          return (
            <button
              aria-pressed={endpoint}
              className={cellClass({
                base: "h-[28px] rounded-[4px] text-[11px] tabular-nums text-[var(--bi-fg)]",
                disabled,
                endpoint,
                inRange: Boolean(fromDate && toDate && day >= fromDate && day <= toDate),
                isToday: isSameDay(day, today),
                outside: !isSameMonth(day, cursor),
              })}
              disabled={disabled}
              key={value}
              onClick={() => onSelect(day)}
              type="button"
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      {mode === "week" ? (
        <p className="mx-0.5 mb-1 mt-1.5 text-[10px] text-[var(--bi-muted)]">
          선택 시 해당 주 전체(월~일)가 지정됩니다.
        </p>
      ) : null}
    </div>
  );
}

// 단일 연도의 12개월 격자. 이전/다음 해로 이동.
function MonthGrid({ from, to, today, onSelect }: GridProps) {
  const anchor = fromYmd(editingAnchor(from, to)) ?? today;
  const anchorYear = anchor.getFullYear();
  const [year, setYear] = useState(anchorYear);

  const fromDate = fromYmd(from);
  const toDate = fromYmd(to);

  return (
    <div className="px-2 pb-1 pt-2">
      <GridHeader
        label={`${year}년`}
        onNext={() => setYear((current) => current + 1)}
        onPrev={() => setYear((current) => current - 1)}
      />
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, month) => {
          const cellStart = new Date(year, month, 1);
          const cellEnd = endOfMonth(cellStart);
          const isStart = Boolean(fromDate && isSameMonth(cellStart, fromDate));
          const isEnd = Boolean(toDate && isSameMonth(cellStart, toDate));
          const endpoint = isStart || isEnd;
          return (
            <button
              className={cellClass({
                base: "h-[34px] rounded-[4px] text-[11px] text-[var(--bi-fg)]",
                endpoint,
                inRange: Boolean(
                  fromDate && toDate && cellEnd >= fromDate && cellStart <= toDate,
                ),
                isToday: today.getFullYear() === year && today.getMonth() === month,
              })}
              key={month}
              onClick={() => onSelect(cellStart)}
              type="button"
            >
              {month + 1}월
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 단일 연도의 4분기. 이전/다음 해로 이동.
function QuarterGrid({ from, to, today, onSelect }: GridProps) {
  const anchor = fromYmd(editingAnchor(from, to)) ?? today;
  const anchorYear = anchor.getFullYear();
  const [year, setYear] = useState(anchorYear);

  const fromDate = fromYmd(from);
  const toDate = fromYmd(to);

  return (
    <div className="px-2 pb-1 pt-2">
      <GridHeader
        label={`${year}년`}
        onNext={() => setYear((current) => current + 1)}
        onPrev={() => setYear((current) => current - 1)}
      />
      <div className="grid grid-cols-2 gap-1">
        {Array.from({ length: 4 }, (_, index) => {
          const cellStart = new Date(year, index * 3, 1);
          const cellEnd = endOfQuarter(cellStart);
          const isStart = Boolean(fromDate && fromDate >= cellStart && fromDate <= cellEnd);
          const isEnd = Boolean(toDate && toDate >= cellStart && toDate <= cellEnd);
          const endpoint = isStart || isEnd;
          return (
            <button
              className={cellClass({
                base: "h-[34px] rounded-[4px] text-[11px] text-[var(--bi-fg)]",
                endpoint,
                inRange: Boolean(
                  fromDate && toDate && cellEnd >= fromDate && cellStart <= toDate,
                ),
                isToday: today.getFullYear() === year && quarterOf(today) === index + 1,
              })}
              key={index}
              onClick={() => onSelect(cellStart)}
              type="button"
            >
              {index + 1}분기
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 12년 격자. 이전/다음 12년으로 이동.
function YearGrid({ from, to, today, onSelect }: GridProps) {
  const anchor = fromYmd(editingAnchor(from, to)) ?? today;
  const anchorYear = anchor.getFullYear();
  const [base, setBase] = useState(anchorYear - (anchorYear % 12));

  const fromDate = fromYmd(from);
  const toDate = fromYmd(to);
  const years = Array.from({ length: 12 }, (_, index) => base + index);

  return (
    <div className="px-2 pb-1 pt-2">
      <GridHeader
        label={`${base} ~ ${base + 11}`}
        onNext={() => setBase((current) => current + 12)}
        onPrev={() => setBase((current) => current - 12)}
      />
      <div className="grid grid-cols-3 gap-1">
        {years.map((year) => {
          const cellStart = new Date(year, 0, 1);
          const cellEnd = new Date(year, 11, 31);
          const isStart = Boolean(fromDate && fromDate.getFullYear() === year);
          const isEnd = Boolean(toDate && toDate.getFullYear() === year);
          const endpoint = isStart || isEnd;
          return (
            <button
              className={cellClass({
                base: "h-[34px] rounded-[4px] text-[11px] tabular-nums text-[var(--bi-fg)]",
                endpoint,
                inRange: Boolean(
                  fromDate && toDate && cellEnd >= fromDate && cellStart <= toDate,
                ),
                isToday: today.getFullYear() === year,
              })}
              key={year}
              onClick={() => onSelect(cellStart)}
              type="button"
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModeGrid(props: GridProps) {
  const anchor = fromYmd(editingAnchor(props.from, props.to)) ?? props.today;
  const anchorYear = anchor.getFullYear();
  if (props.mode === "month") return <MonthGrid key={anchorYear} {...props} />;
  if (props.mode === "quarter") return <QuarterGrid key={anchorYear} {...props} />;
  if (props.mode === "year") return <YearGrid key={anchorYear} {...props} />;
  return <DayGrid key={`${anchorYear}-${anchor.getMonth()}`} {...props} />;
}

/**
 * 단일 날짜 선택기 — 달력 팝오버로 YYYY-MM-DD 값을 고른다.
 * native `<input type="date">` 대신 브라우저 간 동일한 UI를 제공한다.
 * 값은 즉시 상위로 확정되고(적용 버튼 없음), 지우기로 빈 값을 만들 수 있다.
 */
export function DatePicker({
  value,
  onChange,
  today = todayInSeoul(),
  minDate,
  placeholder = "날짜 선택",
  disabled = false,
  error = false,
  clearable = true,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  today?: string;
  /** YYYY-MM-DD. 이 날짜보다 이전은 선택할 수 없다(해당 날짜 자체는 선택 가능). */
  minDate?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  /** 값을 비울 수 있게 '지우기'를 노출한다. */
  clearable?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, position } =
    useAnchoredPopover<HTMLButtonElement>(open, 244);
  const todayDate = fromYmd(today) ?? new Date();
  const minDateValue = fromYmd(minDate);
  const todayBelowMin = Boolean(minDateValue && todayDate < minDateValue);

  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, close, [triggerRef, panelRef]);

  const pick = (date: Date) => {
    onChange(toYmd(date));
    setOpen(false);
  };

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={cn(
          triggerClass,
          "w-full justify-between",
          error && "border-[var(--bi-error)]",
          className,
        )}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className={cn("truncate", !value && "text-[var(--bi-muted)]")}>
          {value || placeholder}
        </span>
        <HiOutlineCalendarDays
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-[var(--bi-muted)]"
        />
      </button>

      {open && position
        ? createPortal(
            <div
              aria-label={ariaLabel ?? "날짜 선택"}
              className={cn(popoverClass, "w-[244px]")}
              data-erp-popover=""
              ref={panelRef}
              role="dialog"
              style={{ left: position.left, top: position.top }}
            >
              {/* 단일 선택이라 from/to 를 같은 값으로 넘겨 해당 날짜만 강조한다. */}
              <ModeGrid
                from={value}
                minDate={minDateValue}
                mode="day"
                onSelect={pick}
                to={value}
                today={todayDate}
              />
              <div className="flex items-center justify-between gap-2 border-t border-[var(--bi-border)] px-2 py-1.5">
                {/* 하한이 미래면 '오늘'이 규칙을 우회하므로 함께 막는다. */}
                <button
                  className={cn(
                    presetChipClass,
                    todayBelowMin && "cursor-not-allowed opacity-40 hover:bg-[var(--bi-table-header)]",
                  )}
                  disabled={todayBelowMin}
                  onClick={() => pick(todayDate)}
                  type="button"
                >
                  오늘
                </button>
                <div className="flex items-center gap-1.5">
                  {clearable ? (
                    <button
                      className={footerGhostClass}
                      onClick={() => {
                        onChange("");
                        setOpen(false);
                      }}
                      type="button"
                    >
                      지우기
                    </button>
                  ) : null}
                  <button className={footerGhostClass} onClick={close} type="button">
                    닫기
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * 일/주/월/분기/연 모드별 프리셋 + 컴팩트 단일 달력 기간 필터.
 * - 상단 시작·종료 탭으로 어느 쪽을 고르는지 명확히 표시(활성 탭 강조).
 * - 시작을 고르면 자동으로 종료 탭으로 넘어간다.
 * - 값(from/to)은 YYYY-MM-DD. 월/분기/연은 해당 단위의 시작일~말일로 확장.
 * - 적용을 눌러야 상위로 확정된다.
 */
export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onRangeChange,
  today = todayInSeoul(),
  modes = ALL_MODES,
  quickToggle = false,
  ariaLabel = "기간 필터",
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  /** 확정된 시작일과 종료일을 한 번에 전달한다. */
  onRangeChange?: (from: string, to: string) => void;
  today?: string;
  modes?: DateRangeMode[];
  /** 달력 버튼 왼쪽에 '전체 / 오늘' 인라인 토글을 노출한다(전체=기간 해제, 오늘=오늘로). */
  quickToggle?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DateRangeMode>(modes[0] ?? "day");
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [editing, setEditing] = useState<Editing>("from");

  const { triggerRef, panelRef, position } =
    useAnchoredPopover<HTMLButtonElement>(open, 268);
  const todayDate = fromYmd(today) ?? new Date();

  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, close, [triggerRef, panelRef]);

  // 실제 열기 동작에서 현재 확정값으로 draft 를 초기화한다.
  const togglePopover = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setDraftFrom(from);
    setDraftTo(to);
    setEditing("from");
    setOpen(true);
  };

  const hasValue = Boolean(from || to);
  const triggerLabel = hasValue ? `${from || to} ~ ${to || from}` : "기간 선택";
  // '전체 / 오늘' 인라인 토글 활성 상태.
  const isAll = !from && !to;
  const isToday = Boolean(from) && from === today && to === today;

  // 버튼 강조는 달력 편집 모드가 아닌 실제 조회 기간을 따른다.
  const matchesRange = (value: DateRangeMode) => {
    const range = PRESETS[value][0].range(todayDate);
    return from === toYmd(range.from) && to === toYmd(range.to);
  };
  const activeMode = modes.includes(mode) && matchesRange(mode)
    ? mode
    : modes.find(matchesRange) ?? null;
  const publishRange = (nextFrom: string, nextTo: string) => {
    if (onRangeChange) onRangeChange(nextFrom, nextTo);
    else {
      onFromChange(nextFrom);
      onToChange(nextTo);
    }
  };

  const applyPreset = (preset: Preset) => {
    const { from: presetFrom, to: presetTo } = preset.range(todayDate);
    setDraftFrom(toYmd(presetFrom));
    setDraftTo(toYmd(presetTo));
    setEditing("from");
  };

  // 모드 버튼을 누르면 그 모드의 기본 프리셋(오늘/이번 주/이번 달/이번 분기/올해)을
  // 즉시 상위로 확정한다 — 모드만 바뀌고 기간은 그대로여서 날짜를 또 골라야 하던 문제를 없앤다.
  const selectMode = (next: DateRangeMode) => {
    setMode(next);
    const preset = PRESETS[next][0];
    if (!preset) return;
    const { from: presetFrom, to: presetTo } = preset.range(todayDate);
    const nextFrom = toYmd(presetFrom);
    const nextTo = toYmd(presetTo);
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    setEditing("from");
    publishRange(nextFrom, nextTo);
    setOpen(false);
  };

  // 달력에서 날짜를 고르면 현재 편집 중인(시작/종료) 쪽에 넣는다.
  const pick = (value: Date) => {
    // 시작을 고르는 경우: (1) 명시적으로 시작 탭을 편집 중이거나,
    // (2) 이미 범위가 모두 잡혀 있으면 새 범위의 시작으로 리셋한다.
    const startNewRange = editing === "from" || (Boolean(draftFrom) && Boolean(draftTo));
    if (startNewRange) {
      setDraftFrom(toYmd(expandStart(mode, value)));
      setDraftTo("");
      setEditing("to");
      return;
    }
    const end = toYmd(expandEnd(mode, value));
    // 종료가 시작보다 앞이면 시작으로 재설정.
    if (draftFrom && end < draftFrom) {
      setDraftFrom(toYmd(expandStart(mode, value)));
      setDraftTo("");
      setEditing("to");
      return;
    }
    setDraftTo(end);
  };

  const commit = () => {
    publishRange(draftFrom, draftTo);
    setOpen(false);
  };

  return (
    <div
      aria-label={ariaLabel}
      // 좁은 컨테이너(필터 팝오버)에서는 모드 pill + 기간 버튼이 한 줄에 안 들어간다.
      // shrink-0 로 밀어붙이면 컨테이너 밖으로 삐져나오므로 줄바꿈을 허용한다.
      className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5"
      role="group"
    >
      {quickToggle ? (
        <div aria-label="기간 빠른 선택" className={modeGroupClass} role="group">
          <button
            aria-pressed={isAll}
            className={cn(
              modePillBase,
              isAll
                ? "bg-[var(--bi-bg)] text-[var(--bi-fg)]"
                : "text-[var(--bi-muted)] hover:text-[var(--bi-fg)]",
            )}
            onClick={() => {
              publishRange("", "");
              setOpen(false);
            }}
            type="button"
          >
            전체
          </button>
          <button
            aria-pressed={isToday}
            className={cn(
              modePillBase,
              isToday
                ? "bg-[var(--bi-bg)] text-[var(--bi-fg)]"
                : "text-[var(--bi-muted)] hover:text-[var(--bi-fg)]",
            )}
            onClick={() => {
              setMode("day");
              publishRange(today, today);
              setOpen(false);
            }}
            type="button"
          >
            오늘
          </button>
        </div>
      ) : null}

      {modes.length > 1 ? (
        <ModePills mode={activeMode} modes={modes} onSelect={selectMode} />
      ) : null}

      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="기간 선택"
        className={triggerClass}
        onClick={togglePopover}
        ref={triggerRef}
        type="button"
      >
        <HiOutlineCalendarDays
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-[var(--bi-muted)]"
        />
        <span className={cn("min-w-0 whitespace-nowrap", !hasValue && "text-[var(--bi-muted)]")}>
          {triggerLabel}
        </span>
      </button>

      {open && position
        ? createPortal(
            <div
              aria-label="기간 선택"
              className={cn(popoverClass, "w-[268px]")}
              data-erp-popover=""
              ref={panelRef}
              role="dialog"
              style={{ left: position.left, top: position.top }}
            >
              <RangeTabs
                editing={editing}
                from={draftFrom}
                mode={mode}
                onEdit={setEditing}
                to={draftTo}
              />

              <div className="flex flex-wrap gap-1 border-b border-[var(--bi-border)] px-2 pb-2">
                {PRESETS[mode].map((preset) => (
                  <button
                    className={presetChipClass}
                    key={preset.label}
                    onClick={() => applyPreset(preset)}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <ModeGrid
                from={draftFrom}
                mode={mode}
                onSelect={pick}
                to={draftTo}
                today={todayDate}
              />

              <div className="flex items-center justify-end gap-1.5 border-t border-[var(--bi-border)] px-2 py-1.5">
                <button className={footerGhostClass} onClick={close} type="button">
                  닫기
                </button>
                <button className={footerPrimaryClass} onClick={commit} type="button">
                  적용
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
