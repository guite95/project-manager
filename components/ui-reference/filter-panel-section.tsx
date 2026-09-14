"use client";

import { useState } from "react";
import { DetailSection } from "@/components/erp/detail-section";
import { FilterBar } from "@/components/erp/filter-bar";
import { FilterChips } from "@/components/erp/filter-chips";
import { FilterPanel } from "@/components/erp/filter-panel";
import type { FilterGroupSpec, FilterValues } from "@/lib/filters/filter-spec";

type Key =
  | "status"
  | "consultType"
  | "productType"
  | "fieldSupport"
  | "itemId"
  | "partnerId"
  | "division"
  | "branchId"
  | "contact"
  | "receivedFrom"
  | "receivedTo";

const EMPTY: FilterValues<Key> = {
  status: "",
  consultType: "",
  productType: "",
  fieldSupport: "",
  itemId: "",
  partnerId: "",
  division: "",
  branchId: "",
  contact: "",
  receivedFrom: "",
  receivedTo: "",
};

const groups = (partnerId: string): FilterGroupSpec<Key>[] => [
  {
    title: "케이스 · 제품",
    fields: [
      {
        kind: "select",
        key: "status",
        label: "상태",
        options: [
          { value: "", label: "상태 전체" },
          { value: "RECEIVED", label: "1. 접수" },
          { value: "COMPLETED", label: "6. 완료" },
        ],
      },
      {
        kind: "select",
        key: "consultType",
        label: "상담구분",
        options: [
          { value: "", label: "상담구분 전체" },
          { value: "SETTING", label: "설정" },
          { value: "ISSUE", label: "장애" },
        ],
      },
      {
        kind: "select",
        key: "productType",
        label: "제품구분",
        options: [
          { value: "", label: "제품구분 전체" },
          { value: "DVR", label: "DVR" },
          { value: "WEB_MONITORING", label: "웹관제" },
        ],
      },
      {
        kind: "select",
        key: "fieldSupport",
        label: "현장지원",
        options: [
          { value: "", label: "현장지원 전체" },
          { value: "true", label: "현장지원 있음" },
          { value: "false", label: "현장지원 없음" },
        ],
      },
      {
        kind: "select",
        key: "itemId",
        label: "제품",
        options: [
          { value: "", label: "제품 전체" },
          { value: "1", label: "FA-100 · 통합 관제 서버" },
        ],
        searchable: true,
        searchPlaceholder: "제품 검색",
        span: 2,
      },
    ],
  },
  {
    title: "고객 · 현장",
    fields: [
      {
        kind: "select",
        key: "partnerId",
        label: "거래처",
        options: [
          { value: "", label: "거래처 전체" },
          { value: "1", label: "테스트 고객사" },
        ],
        searchable: true,
        searchPlaceholder: "거래처 검색",
      },
      {
        kind: "select",
        key: "division",
        label: "본부",
        options: [{ value: "", label: "본부 전체" }],
        searchable: true,
        disabled: partnerId === "",
        disabledHint: "거래처 먼저",
      },
      {
        kind: "select",
        key: "branchId",
        label: "지사",
        options: [{ value: "", label: "지사 전체" }],
        searchable: true,
        disabled: partnerId === "",
        disabledHint: "거래처 먼저",
      },
      {
        kind: "text",
        key: "contact",
        label: "연락처",
        placeholder: "연락처 일부 입력",
        span: 3,
      },
    ],
  },
  {
    title: "기간",
    columns: 2,
    fields: [
      {
        kind: "dateRange",
        fromKey: "receivedFrom",
        toKey: "receivedTo",
        label: "접수일",
      },
    ],
  },
];

export function FilterPanelSection() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY);
  const [open, setOpen] = useState(false);

  return (
    <DetailSection title="8. 상세 필터와 선택 칩">
      <FilterBar
        onSearchChange={setSearch}
        search={search}
        searchPlaceholder="증상·응대내용 검색"
      >
        <FilterPanel
          groups={groups(filters.partnerId)}
          onApply={setFilters}
          onOpenChange={setOpen}
          open={open}
          normalizeDraft={(draft, changedKey) =>
            changedKey === "partnerId"
              ? { ...draft, division: "", branchId: "" }
              : draft
          }
          value={filters}
        />
        <FilterChips
          groups={groups(filters.partnerId)}
          onChange={setFilters}
          onOverflowClick={() => setOpen(true)}
          value={filters}
        />
      </FilterBar>
      <div className="px-6 py-4 text-xs text-[var(--bi-muted)]">
        적용된 값:{" "}
        <code className="text-[var(--bi-fg)]">
          {JSON.stringify(filters)}
        </code>
      </div>
    </DetailSection>
  );
}
