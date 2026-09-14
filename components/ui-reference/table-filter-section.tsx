"use client";

import { useMemo, useState } from "react";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/erp/data-table";
import { DetailSection } from "@/components/erp/detail-section";
import { DateRangeFilter } from "@/components/erp/date-picker";
import { FilterBar } from "@/components/erp/filter-bar";
import { Select } from "@/components/erp/select";
import { hangulIncludes } from "@/components/erp/hangul-match";

type Row = {
  id: number;
  code: string;
  name: string;
  qty: number;
  status: "ACTIVE" | "INACTIVE";
  registeredOn: string;
};

const ROWS: Row[] = [
  { id: 1, code: "A-001", name: "품목 가", qty: 120, status: "ACTIVE", registeredOn: "2026-08-13" },
  { id: 2, code: "A-002", name: "품목 나", qty: 8, status: "INACTIVE", registeredOn: "2026-08-14" },
];

const COLUMNS: DataTableColumn<Row>[] = [
  {
    key: "status",
    header: "상태",
    render: (row) => (row.status === "ACTIVE" ? "사용중" : "비활성"),
  },
  { key: "code", header: "코드", render: (row) => row.code },
  { key: "name", header: "이름", render: (row) => row.name },
  { key: "registeredOn", header: "등록일", render: (row) => row.registeredOn },
  {
    key: "qty",
    header: "수량",
    align: "right",
    render: (row) => row.qty,
  },
];

export function TableFilterSection() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filteredRows = useMemo(
    () =>
      ROWS.filter(
        (row) =>
          (hangulIncludes(row.code, search) ||
            hangulIncludes(row.name, search)) &&
          (!status || row.status === status) &&
          (!from || row.registeredOn >= from) &&
          (!to || row.registeredOn <= to)
      ),
    [search, status, from, to]
  );

  return (
    <DetailSection title="7. 필터와 기본 테이블">
      <FilterBar onSearchChange={setSearch} search={search}>
        <Select
          ariaLabel="상태 필터"
          onChange={setStatus}
          options={[
            { value: "", label: "전체 상태" },
            { value: "ACTIVE", label: "사용중" },
            { value: "INACTIVE", label: "비활성" },
          ]}
          value={status}
        />
        <DateRangeFilter
          ariaLabel="조회 기간"
          from={from}
          onFromChange={setFrom}
          onToChange={setTo}
          quickToggle
          to={to}
        />
      </FilterBar>
      <DataTable
        caption="필터가 적용되는 샘플 데이터"
        columns={COLUMNS}
        emptyMessage="조건에 맞는 데이터가 없습니다."
        rowKey={(row) => String(row.id)}
        rows={filteredRows}
      />
      <DataTable
        caption="빈 상태 샘플"
        columns={COLUMNS}
        emptyMessage="등록된 데이터가 없습니다."
        rowKey={(row) => String(row.id)}
        rows={[]}
      />
    </DetailSection>
  );
}
