"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { cx } from "../lib/class-names";
import { MoreIcon } from "./icons";

export type ActionMenuItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  /** 파괴적 액션은 danger 톤으로 표시한다. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** false면 선택 후에도 메뉴를 닫지 않는다(삭제 → 삭제 확인 같은 2단계 확인). 기본 true. */
  closeOnSelect?: boolean;
  onSelect: () => void;
};

export type ActionMenuProps = {
  /** 트리거 버튼의 접근성 이름 (예: "김물류 관리 메뉴") */
  ariaLabel: string;
  items: readonly ActionMenuItem[];
  /** 패널 정렬 기준 모서리. 표의 마지막 칼럼에서는 기본값(right)을 쓴다. */
  align?: "right" | "left";
  className?: string;
};

/**
 * 표 행 우측의 ⋯(더보기) 버튼으로 여는 행 액션 메뉴.
 * 마지막 액션 칼럼에 인라인 컨트롤을 나열하는 대신 이 메뉴로 모은다 —
 * 헤더 라벨 없는 우측 정렬 칼럼에 트리거만 둔다.
 * 바깥 클릭·Escape로 닫히고 방향키로 항목을 이동한다.
 */
export function ActionMenu({ ariaLabel, items, align = "right", className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)")
    );
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLElement);
    const next = buttons[(current + step + buttons.length) % buttons.length];
    next?.focus();
    event.preventDefault();
  };

  return (
    <div className={cx("pds", "pds-action-menu", align === "left" && "pds-action-menu--left", className)} ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cx("pds-action-menu__trigger", open && "is-open")}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        ref={triggerRef}
        type="button"
      >
        <MoreIcon size={15} />
      </button>
      {open ? (
        <div
          aria-label={ariaLabel}
          className="pds-action-menu__panel"
          id={panelId}
          onKeyDown={moveFocus}
          role="menu"
        >
          {items.map((item) => (
            <button
              className={cx(item.tone === "danger" && "is-danger")}
              disabled={item.disabled}
              key={item.key}
              onClick={(event) => {
                event.stopPropagation();
                item.onSelect();
                if (item.closeOnSelect !== false) setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
