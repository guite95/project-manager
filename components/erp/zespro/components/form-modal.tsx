"use client";

import {
  useCallback,
  useId,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { cx } from "../lib/class-names";
import { Button } from "./button";
import { CloseIcon } from "./icons";
import { Modal } from "./modal";

export type FormModalProps = {
  open: boolean;
  onClose: () => void;
  /** 모달 헤더에 보이는 제목 */
  title: ReactNode;
  /** 제목 아래 한 줄 설명 */
  description?: ReactNode;
  /** 다이얼로그 접근성 이름. title이 문자열이 아니면 반드시 넘긴다 */
  ariaLabel?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /**
   * 저장 처리. 넘기면 본문이 `form`으로 감싸져 Enter로도 제출되고
   * 기본 푸터(취소 + 저장)가 렌더된다.
   */
  onSubmit?: () => void;
  submitLabel?: ReactNode;
  submitDisabled?: boolean;
  cancelLabel?: ReactNode;
  /** 기본 푸터 대신 직접 구성할 때 쓰는 슬롯 */
  actions?: ReactNode;
  width?: CSSProperties["width"];
  /** 포털 루트(backdrop)에 붙는 클래스 — 앱 토큰 스코프를 넘긴다 */
  rootClassName?: string;
  /** 다이얼로그 패널에 붙는 클래스 */
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * 등록·수정 폼 모달의 표준 셸 — 헤더(제목·설명·닫기) + 스크롤 본문 + 액션 푸터.
 * 포털, backdrop, Escape 닫기, 포커스 트랩과 복원은 `Modal`이 담당한다.
 * 본문은 `FormSections` + `FormSection` + `FormGrid` + `FormField`로 구성한다.
 */
export function FormModal({
  open,
  onClose,
  title,
  description,
  ariaLabel,
  closeLabel = "닫기",
  closeOnBackdrop,
  closeOnEscape,
  onSubmit,
  submitLabel = "저장",
  submitDisabled = false,
  cancelLabel = "취소",
  actions,
  width = "min(560px, 100%)",
  rootClassName,
  className,
  bodyClassName,
  children
}: FormModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  const footer = actions ?? (onSubmit ? (
    <>
      <Button type="button" variant="secondary" size="small" onClick={onClose}>{cancelLabel}</Button>
      <Button type="submit" variant="primary" size="small" disabled={submitDisabled}>{submitLabel}</Button>
    </>
  ) : null);

  const body = (
    <>
      <header className="pds-form-modal__header">
        <div className="pds-form-modal__heading">
          <h2 id={titleId}>{title}</h2>
          {description != null ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <button type="button" className="pds-form-modal__close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <CloseIcon size={16} />
        </button>
      </header>
      <div className={cx("pds-form-modal__body", bodyClassName)}>{children}</div>
      {footer ? <footer className="pds-form-modal__footer">{footer}</footer> : null}
    </>
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submitDisabled) onSubmit?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      showCloseButton={false}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      className={cx("pds-form-modal-root", rootClassName)}
      contentClassName={cx("pds-form-modal", className)}
      style={{ width }}
    >
      {onSubmit ? <form className="pds-form-modal__form" onSubmit={handleSubmit} noValidate>{body}</form> : body}
    </Modal>
  );
}

/** 폼 섹션 묶음. 섹션 사이 간격만 담당한다. */
export function FormSections({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("pds", "pds-form-sections", className)}>{children}</div>;
}

export type FormSectionProps = {
  icon?: ReactNode;
  title: ReactNode;
  /** 제목 줄 오른쪽 끝의 보조 문구 (변경 불가 안내 등) */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** 아이콘 + 제목의 구분선 머리말을 가진 폼 섹션. */
export function FormSection({ icon, title, hint, className, children }: FormSectionProps) {
  return (
    <section className={cx("pds-form-section", className)}>
      <div className="pds-form-section__head">
        {icon ? <span className="pds-form-section__icon">{icon}</span> : null}
        <span className="pds-form-section__title">{title}</span>
        {hint != null ? <small>{hint}</small> : null}
      </div>
      {children}
    </section>
  );
}

/** 폼 필드를 배치하는 그리드. 기본 2열이며 좁은 화면에서 1열로 접힌다. */
export function FormGrid({ columns = 2, className, children }: { columns?: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={cx("pds-form-grid", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export type FormFieldProps = {
  label: ReactNode;
  /** 라벨 아래 보조 설명 */
  hint?: ReactNode;
  /** 그리드 한 줄 전체를 차지 (긴 텍스트 영역 등) */
  span?: "full";
  className?: string;
  children: ReactNode;
};

/**
 * 라벨 + 입력 컨트롤 한 벌. `label` 요소가 컨트롤을 감싸므로 별도 id 연결 없이
 * 라벨과 컨트롤이 묶인다. 안쪽 `input`·`select`·`textarea`는 공통 규격으로 스타일된다.
 * `hint`는 label 밖에 두어 컨트롤의 접근성 이름이 "라벨 + 힌트"로 합쳐지지 않게 한다.
 * 읽기 전용 라벨-값 표시는 `FieldGrid`를 쓴다.
 */
export function FormField({ label, hint, span, className, children }: FormFieldProps) {
  return (
    <div className={cx("pds-form-field", span === "full" && "pds-form-field--full", className)}>
      <label className="pds-form-field__control">
        <span className="pds-form-field__label">{label}</span>
        {children}
      </label>
      {hint != null ? <small className="pds-form-field__hint">{hint}</small> : null}
    </div>
  );
}

/** 입력 앞 아이콘과 뒤 단위 표기를 붙이는 래퍼. children에는 input 또는 select 하나를 넣는다. */
export function InputAffix({ icon, unit, className, children }: { icon?: ReactNode; unit?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span className={cx("pds-input-affix", Boolean(icon) && "has-icon", unit != null && "has-unit", className)}>
      {icon ? <span className="pds-input-affix__icon">{icon}</span> : null}
      {unit != null ? <b className="pds-input-affix__unit">{unit}</b> : null}
      {children}
    </span>
  );
}

const RADIO_SELECTOR = "[role='radio']:not([disabled])";

/**
 * 상호배타 선택을 카드로 고르는 라디오 그룹. `ChoiceCard`를 children으로 넣는다.
 * 방향키로 카드 사이를 이동한다(radiogroup 키보드 규약).
 */
export function ChoiceGrid({
  label,
  columns = 2,
  className,
  children
}: {
  label: string;
  columns?: number;
  className?: string;
  children: ReactNode;
}) {
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(RADIO_SELECTOR));
    if (radios.length === 0) return;
    const current = radios.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    event.preventDefault();
    radios[(current + step + radios.length) % radios.length]?.focus();
  }, []);

  return (
    <div
      className={cx("pds-choice-grid", className)}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export type ChoiceCardProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  className?: string;
};

export function ChoiceCard({ icon, title, description, selected, disabled, onSelect, className }: ChoiceCardProps) {
  return (
    <button
      aria-checked={selected}
      className={cx("pds-choice-card", selected && "is-selected", className)}
      disabled={disabled}
      onClick={onSelect}
      role="radio"
      // 선택된 카드만 탭 순서에 남기고 나머지는 방향키로 이동한다.
      tabIndex={selected ? 0 : -1}
      type="button"
    >
      {icon ? <span className="pds-choice-card__icon">{icon}</span> : null}
      <span className="pds-choice-card__body">
        <strong>{title}</strong>
        {description != null ? <span>{description}</span> : null}
      </span>
    </button>
  );
}

/** 다중 선택 체크 타일 그룹. 항목이 없으면 emptyMessage를 보여준다. */
export function CheckTileGroup({
  label,
  emptyMessage,
  columns = 2,
  className,
  children
}: {
  label: string;
  emptyMessage?: ReactNode;
  columns?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx("pds-check-tiles", className)}
      role="group"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {emptyMessage != null ? <span className="pds-check-tiles__empty">{emptyMessage}</span> : children}
    </div>
  );
}

export type CheckTileProps = {
  icon?: ReactNode;
  label: ReactNode;
  /** 코드·수량처럼 오른쪽 끝에 붙는 보조 표기 */
  meta?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
};

export function CheckTile({ icon, label, meta, checked, disabled, onToggle, className }: CheckTileProps) {
  return (
    <label className={cx("pds-check-tile", checked && "is-checked", disabled && "is-disabled", className)}>
      <input checked={checked} disabled={disabled} onChange={onToggle} type="checkbox" />
      {icon ? <span className="pds-check-tile__icon">{icon}</span> : null}
      <span className="pds-check-tile__label">{label}</span>
      {meta != null ? <i className="pds-check-tile__meta">{meta}</i> : null}
    </label>
  );
}
