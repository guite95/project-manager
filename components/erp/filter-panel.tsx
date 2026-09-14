"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HiOutlineFunnel } from "react-icons/hi2";
import {
  clampSpan,
  clearAllFilters,
  countActiveFilters,
  fieldId,
  gridTemplate,
  type FilterFieldSpec,
  type FilterGroupSpec,
  type FilterValues,
} from "@/lib/filters/filter-spec";
import { Badge } from "./badge";
import { Button } from "./button";
import { cn } from "./cn";
import { DateRangeFilter } from "./date-picker";
import { Dropdown } from "./dropdown";
import { useAnchoredPopover, useDismiss } from "./use-anchored-popover";

/** DESIGN.md 3열 격자: 176 × 3 + gap 12 × 2 + padding 12 × 2 */
const PANEL_WIDTH = 576;

const fieldControlClass =
  "h-[30px] w-full rounded-[4px] border border-[var(--bi-border)] bg-[var(--bi-bg)] px-2 text-xs outline-none focus:border-[var(--bi-accent)]";

export function FilterPanel<K extends string>({
  groups,
  value,
  open,
  onOpenChange,
  onApply,
  normalizeDraft,
  label = "필터",
}: {
  groups: FilterGroupSpec<K>[];
  value: FilterValues<K>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (next: FilterValues<K>) => void;
  /** 한 값이 바뀐 뒤 파생 값을 정리한다. 예: 거래처가 바뀌면 본부·지사를 비운다. */
  normalizeDraft?: (draft: FilterValues<K>, changedKey: K) => FilterValues<K>;
  label?: string;
}) {
  const { triggerRef, panelRef, position } =
    useAnchoredPopover<HTMLButtonElement>(open, PANEL_WIDTH);
  const close = useMemo(() => () => onOpenChange(false), [onOpenChange]);
  useDismiss(open, close, [triggerRef, panelRef]);

  const activeCount = countActiveFilters(groups, value);

  // 닫힐 때 트리거로 포커스를 되돌린다. 키보드 사용자가 문서 처음으로 튀지 않게 한다.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open, triggerRef]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-2.5 text-xs font-medium outline-none",
          "cursor-pointer border-[var(--bi-border)] bg-[var(--bi-bg)] hover:bg-[var(--bi-table-header)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bi-accent)]",
          open && "border-[var(--bi-accent)]",
        )}
        onClick={() => onOpenChange(!open)}
        ref={triggerRef}
        type="button"
      >
        <HiOutlineFunnel aria-hidden="true" size={14} />
        {label}
        {activeCount > 0 ? <Badge variant="primary">{activeCount}</Badge> : null}
      </button>

      {/* 팝오버는 fixed 다. overflow-hidden 을 주지 않는다 — Dropdown 목록이
          포털이 아니라 이 안의 absolute 라 클리핑되면 잘린다. */}
      {open && position ? (
        <div
          aria-label={label}
          className={cn(
            "bi-overlay-in fixed z-50 flex flex-col rounded-[4px]",
            "border border-[var(--bi-border)] bg-[var(--bi-card-bg)]",
          )}
          ref={panelRef}
          role="dialog"
          style={{
            left: position.left,
            top: position.top,
            width: `min(${PANEL_WIDTH}px, calc(100vw - 32px))`,
          }}
        >
          <FilterPanelBody
            groups={groups}
            initialValue={value}
            label={label}
            normalizeDraft={normalizeDraft}
            onApply={(next) => {
              onApply(next);
              onOpenChange(false);
            }}
            onCancel={close}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * draft 를 소유하는 본문. 패널이 열릴 때만 mount 되므로 열 때마다 확정값으로
 * 초기화되고, 닫히면 draft 가 사라진다 — 취소·ESC·바깥 클릭이 곧 "적용 안 함"이다.
 */
function FilterPanelBody<K extends string>({
  groups,
  initialValue,
  label,
  normalizeDraft,
  onApply,
  onCancel,
}: {
  groups: FilterGroupSpec<K>[];
  initialValue: FilterValues<K>;
  label: string;
  normalizeDraft?: (draft: FilterValues<K>, changedKey: K) => FilterValues<K>;
  onApply: (next: FilterValues<K>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  const draftCount = countActiveFilters(groups, draft);

  const setValue = (key: K, next: string) =>
    setDraft((current) => {
      const updated = { ...current, [key]: next } as FilterValues<K>;
      return normalizeDraft ? normalizeDraft(updated, key) : updated;
    });

  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--bi-border)] px-3 py-2 text-[11px] font-semibold tracking-[0.02em] text-[var(--bi-muted)]">
        <span>{label}</span>
        <span className="text-[var(--bi-accent)]">
          {draftCount > 0 ? `${draftCount}개 선택` : "선택 없음"}
        </span>
      </div>

      <div className="p-3">
        {groups.map((group, index) => (
          <div
            className={index > 0 ? "mt-3.5" : undefined}
            key={group.title ?? `group-${index}`}
          >
            {group.title ? (
              <div className="mb-2 border-b border-[var(--bi-border)] pb-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--bi-muted)]">
                {group.title}
              </div>
            ) : null}
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: gridTemplate(group.columns) }}
            >
              {group.fields.map((field, fieldIndex) => (
                <FilterField
                  autoFocus={index === 0 && fieldIndex === 0}
                  columns={group.columns ?? 3}
                  field={field}
                  key={fieldId(field)}
                  onChange={setValue}
                  values={draft}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* DESIGN.md §4 CTA 배치: 마지막 자식, primary 가 맨 오른쪽 */}
      <div className="flex items-center justify-between border-t border-[var(--bi-border)] px-3 py-2">
        <Button
          onClick={() => setDraft(clearAllFilters(groups, draft))}
          size="sm"
          variant="ghost"
        >
          초기화
        </Button>
        <div className="flex gap-1.5">
          <Button onClick={onCancel} size="sm" variant="secondary">
            취소
          </Button>
          <Button onClick={() => onApply(draft)} size="sm">
            적용
          </Button>
        </div>
      </div>
    </>
  );
}

function FieldCaption({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-medium tracking-[0.02em] text-[var(--bi-muted)]">
      {children}
    </span>
  );
}

function FilterField<K extends string>({
  field,
  values,
  columns,
  autoFocus,
  onChange,
}: {
  field: FilterFieldSpec<K>;
  values: FilterValues<K>;
  columns: 2 | 3;
  autoFocus: boolean;
  onChange: (key: K, value: string) => void;
}) {
  const span = clampSpan(field.span, columns);
  const style = span > 1 ? { gridColumn: `span ${span}` } : undefined;

  if (field.kind === "dateRange") {
    // modes 를 day 하나로 고정한다. 기본값(5개 모드 필드)은 인라인 pill 이 넓어
    // 176px 격자 칸을 넘긴다. day 모드 프리셋(오늘·어제·최근 7일·최근 30일·
    // 이번 달·올해)은 팝오버 안에 그대로 남는다.
    return (
      <div style={style}>
        <FieldCaption>{field.label}</FieldCaption>
        <DateRangeFilter
          ariaLabel={field.label}
          from={values[field.fromKey] ?? ""}
          modes={["day"]}
          onFromChange={(next) => onChange(field.fromKey, next)}
          onToChange={(next) => onChange(field.toKey, next)}
          to={values[field.toKey] ?? ""}
        />
      </div>
    );
  }

  if (field.kind === "text") {
    return (
      <label className="block" style={style}>
        <FieldCaption>{field.label}</FieldCaption>
        <input
          autoFocus={autoFocus}
          className={fieldControlClass}
          onChange={(event) => onChange(field.key, event.target.value)}
          placeholder={field.placeholder}
          value={values[field.key] ?? ""}
        />
      </label>
    );
  }

  return (
    <div style={style}>
      <FieldCaption>{field.label}</FieldCaption>
      {field.disabled && field.disabledHint ? (
        // 비활성 사유를 글로 표시한다 — 색상만으로 상태를 전달하지 않는다.
        <div
          aria-disabled="true"
          aria-label={`${field.label} (${field.disabledHint})`}
          className={cn(
            fieldControlClass,
            "flex cursor-not-allowed items-center bg-[var(--bi-sidebar-bg)] text-[var(--bi-muted)]",
          )}
        >
          {field.disabledHint}
        </div>
      ) : (
        <Dropdown
          ariaLabel={field.label}
          autoFocus={autoFocus}
          disabled={field.disabled}
          onChange={(next) => onChange(field.key, next)}
          options={field.options}
          searchable={field.searchable}
          searchPlaceholder={field.searchPlaceholder}
          value={values[field.key] ?? ""}
        />
      )}
    </div>
  );
}
