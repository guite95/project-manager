"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/class-names";
import { CloseIcon } from "./icons";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

let openModalCount = 0;
let originalBodyOverflow = "";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
};

export function Modal({
  open,
  onClose,
  children,
  title,
  ariaLabel,
  closeLabel = "닫기",
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = false,
  className,
  contentClassName,
  style
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (openModalCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModalCount += 1;

    const frame = window.requestAnimationFrame(() => {
      // [data-autofocus]가 있으면 그 요소부터 포커스한다 — 첫 포커서블이 닫기·삭제
      // 같은 버튼일 때 파괴적 액션에 포커스 링이 잡히는 것을 소비 화면이 피할 수 있다.
      const preferred = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (preferred ?? firstFocusable ?? dialogRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = originalBodyOverflow;
      previouslyFocused?.focus();
    };
  }, [closeOnEscape, open]);

  if (!open || typeof document === "undefined") return null;

  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div
      className={cx("pds pds-modal-backdrop", className)}
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        className={cx("pds-modal", contentClassName)}
        style={style}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {title ? <h2 id={titleId} className="pds-sr-only">{title}</h2> : null}
        {showCloseButton ? (
          <button type="button" className="pds-modal-floating-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
            <CloseIcon size={18} />
          </button>
        ) : null}
        {children}
      </div>
    </div>,
    document.fullscreenElement ?? document.body
  );
}
