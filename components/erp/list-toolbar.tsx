"use client";

import type { ReactNode } from "react";
import { FilterBar, FilterMeta, FilterSearchInput } from "@/components/erp/zespro/support";
import { HiOutlineMagnifyingGlass } from "react-icons/hi2";

export type ListToolbarSearch = {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** 검색창 접근성 이름. 없으면 placeholder를 쓴다. */
  ariaLabel?: string;
  width?: number;
};

export type ListToolbarProps = {
  /** 좌측 필터 슬롯 — SegmentedFilter 그룹과 SegmentedFilterDivider를 놓는다. */
  children?: ReactNode;
  /** 검색창 왼쪽의 보조 정보(예: "12건", "조회 중"). */
  meta?: ReactNode;
  /** 최우측 검색창. 없으면 그리지 않는다. */
  search?: ListToolbarSearch;
  /** 건수·검색창 왼쪽의 보기 전환 등 도구 슬롯(예: ViewModeToggle). */
  tools?: ReactNode;
  /** 검색창 오른쪽 끝의 주요 동작(예: 새로 만들기 버튼). */
  actions?: ReactNode;
  /** 필터가 많은 화면에서 줄바꿈을 허용한다. */
  wrap?: boolean;
  className?: string;
};

// 목록 화면 공통 툴바. 좌측 = 세그먼트 토글, 우측 = 도구 → 건수 → 검색창 → 주요 동작 순서로
// 고정해 모든 목록에서 필터·검색·버튼 위치가 같게 한다. 디자인 시스템 FilterBar를 그대로 쓴다.
export function ListToolbar({ actions, children, className, meta, search, tools, wrap = false }: ListToolbarProps) {
  const trailing =
    meta !== undefined || search || tools || actions ? (
      <div className="bi-list-toolbar-actions flex min-w-0 flex-wrap items-center gap-3">
        {tools}
        {meta !== undefined ? <FilterMeta>{meta}</FilterMeta> : null}
        {search ? (
          <FilterSearchInput
            aria-label={search.ariaLabel ?? search.placeholder}
            icon={<HiOutlineMagnifyingGlass aria-hidden size={15} />}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            value={search.value}
            width={search.width ?? 280}
          />
        ) : null}
        {actions}
      </div>
    ) : undefined;

  return (
    <FilterBar className={["bi-list-toolbar", className].filter(Boolean).join(" ")} trailing={trailing} wrap={wrap}>
      {/* 토글이 폭을 넘치면 잘라내지 않고 줄바꿈한다(마지막 칩이 검색창 뒤로 숨는 것을 막는다) */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-[10px] gap-y-1.5">{children}</div>
    </FilterBar>
  );
}
