"use client";

import { Button, Modal } from "@/components/erp/zespro/support";
import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * 브라우저 기본 `window.confirm`·`window.alert`를 대체하는 공용 다이얼로그.
 * 디자인 시스템 `Modal` 위에 폼 모달과 같은 헤더·본문·푸터 규격으로 그린다.
 * 사용처는 `useConfirm()`이 주는 `confirm`/`alert`를 await 해서 사용자의 선택을 받는다.
 */
export type ConfirmDialogOptions = {
  title?: ReactNode;
  message: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** 삭제·회수처럼 되돌리기 어려운 동작은 danger로 두고 취소 버튼에 먼저 포커스한다. */
  tone?: "default" | "danger";
};

export type AlertDialogOptions = Omit<ConfirmDialogOptions, "cancelLabel">;

type DialogState = ConfirmDialogOptions & { kind: "confirm" | "alert" };

type ConfirmContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);

  const settle = useCallback((accepted: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setState(null);
    resolve?.(accepted);
  }, []);

  const open = useCallback((next: DialogState) => new Promise<boolean>((resolve) => {
    // 앞선 다이얼로그가 아직 열려 있으면 취소로 정리하고 새 요청을 띄운다.
    resolveRef.current?.(false);
    resolveRef.current = resolve;
    setState(next);
  }), []);

  const value = useMemo<ConfirmContextValue>(() => ({
    confirm: (options) => open({ ...options, kind: "confirm" }),
    alert: async (options) => { await open({ ...options, kind: "alert" }); },
  }), [open]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog state={state} onSettle={settle} />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm은 ConfirmDialogProvider 안에서만 사용할 수 있습니다.");
  return context;
}

function ConfirmDialog({ state, onSettle }: { state: DialogState | null; onSettle: (accepted: boolean) => void }) {
  const titleId = useId();
  const messageId = useId();
  if (!state) return null;

  const danger = state.tone === "danger";
  const title = state.title ?? (state.kind === "alert" ? "알림" : "확인");
  const confirmLabel = state.confirmLabel ?? "확인";
  const cancelLabel = state.cancelLabel ?? "취소";

  return (
    <Modal
      open
      onClose={() => onSettle(false)}
      ariaLabel={typeof title === "string" ? title : undefined}
      className="pds-form-modal-root pds"
      contentClassName="pds-form-modal"
      closeOnBackdrop={false}
      style={{ width: "min(420px, 100%)" }}
    >
      <div role={state.kind === "alert" ? "alertdialog" : undefined} aria-labelledby={titleId} aria-describedby={messageId}>
        <header className="pds-form-modal__header" style={{ minHeight: 0 }}>
          <div className="pds-form-modal__heading">
            <h2 id={titleId}>{title}</h2>
          </div>
        </header>
        <div id={messageId} className="pds-form-modal__body whitespace-pre-line text-[13px] leading-6 text-[var(--bi-fg)]">
          {state.message}
        </div>
        <footer className="pds-form-modal__footer">
          {state.kind === "confirm" ? (
            <Button type="button" variant="secondary" size="small" onClick={() => onSettle(false)} data-autofocus={danger ? "" : undefined}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            size="small"
            onClick={() => onSettle(true)}
            data-autofocus={danger ? undefined : ""}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
