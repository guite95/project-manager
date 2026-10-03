"use client";

import { Fragment, useRef, type ReactNode } from "react";
import { cx } from "../lib/class-names";

export type TabItem<T extends string = string> = {
  key: T;
  label: ReactNode;
  icon?: ReactNode;
  /** 라벨 옆 카운트 배지 */
  meta?: ReactNode;
  /** "end"면 이 항목부터 오른쪽 끝으로 밀어낸다 */
  align?: "start" | "end";
  disabled?: boolean;
  id?: string;
  panelId?: string;
};

export type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  /** underline: 화면 뷰 전환 / segmented: 좁은 영역의 모드 전환 */
  variant?: "underline" | "segmented";
  size?: "medium" | "small";
  /** 탭 줄 아래 경계선 (underline 전용) */
  bordered?: boolean;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
};

/**
 * 뷰 전환 탭. 목록을 걸러내는 용도라면 `FilterBar` + `FilterButton`을 쓴다.
 *  - 탭: 선택에 따라 **표시되는 콘텐츠가 바뀐다** (창고이동 / 재고조정)
 *  - 필터: 콘텐츠는 그대로고 **행이 걸러진다** (전체 / 진행중 / 완료)
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = "underline",
  size = "medium",
  bordered = true,
  className,
  itemClassName,
  ariaLabel,
}: TabsProps<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const enabled = items.filter(item => !item.disabled);
  const focusKey = enabled.some(item => item.key === value) ? value : enabled[0]?.key;
  let insertedEndSpacer = false;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        "pds",
        "pds-tabs",
        `pds-tabs--${variant}`,
        `pds-tabs--${size}`,
        bordered && variant === "underline" && "pds-tabs--bordered",
        className
      )}
    >
      {items.map((item) => {
        const active = item.key === value;
        const shouldInsertSpacer = item.align === "end" && !insertedEndSpacer;
        if (shouldInsertSpacer) insertedEndSpacer = true;

        return (
          <Fragment key={item.key}>
            {shouldInsertSpacer ? <span className="pds-tabs__spacer" /> : null}
            <button
              ref={element => { if (element) buttons.current.set(item.key, element); else buttons.current.delete(item.key); }}
              type="button"
              role="tab"
              id={item.id}
              aria-controls={item.panelId}
              aria-selected={active}
              tabIndex={item.key === focusKey ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.key)}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !enabled.length) return;
                event.preventDefault();
                const index = enabled.findIndex(tab => tab.key === item.key);
                const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
                  : (index + (event.key === 'ArrowLeft' ? -1 : 1) + enabled.length) % enabled.length;
                const next = enabled[nextIndex];
                onChange(next.key);
                buttons.current.get(next.key)?.focus();
              }}
              className={cx("pds-tabs__tab", active && "is-active", item.disabled && "is-disabled", itemClassName)}
            >
              {item.icon ? <span className="pds-tabs__icon">{item.icon}</span> : null}
              <span className="pds-tabs__label">{item.label}</span>
              {item.meta !== undefined ? <span className="pds-tabs__meta">{item.meta}</span> : null}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
