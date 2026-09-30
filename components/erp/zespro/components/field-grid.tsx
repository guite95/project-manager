"use client";

import type { ReactNode } from "react";
import { cx } from "../lib/class-names";

export type FieldGridItem = {
  label: ReactNode;
  value: ReactNode;
  /** 한 행을 전부 차지 */
  span?: "full";
  /** 값에 monospace 적용 (코드·번호) */
  mono?: boolean;
};

export type FieldGridProps = {
  items: readonly FieldGridItem[];
  /** 열 수 (기본 2) */
  columns?: number;
  /** 라벨 열 폭(px) */
  labelWidth?: number;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/**
 * 라벨-값 정의형 그리드. 상세 모달·기준정보 패널에서 반복되는
 * "회색 라벨 셀 + 값 셀" 표를 표준화한다.
 * 상품 전용 시그니처인 `ProductFieldGrid`와 달리 도메인 중립이다.
 */
export function FieldGrid({ items, columns = 2, labelWidth = 108, title, action, className }: FieldGridProps) {
  return (
    <section className={cx("pds", "pds-field-grid-section", className)}>
      {(title || action) && (
        <div className="pds-field-grid__header">
          {title ? <div className="pds-field-grid__title">{title}</div> : <span />}
          {action}
        </div>
      )}
      <div
        className="pds-field-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((item, index) => (
          <div
            key={index}
            className={cx("pds-field-grid__row", item.span === "full" && "pds-field-grid__row--full")}
            style={{
              gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`,
              gridColumn: item.span === "full" ? `span ${columns}` : undefined,
            }}
          >
            <div className="pds-field-grid__label">{item.label}</div>
            <div className={cx("pds-field-grid__value", item.mono && "pds-field-grid__value--mono")}>{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
