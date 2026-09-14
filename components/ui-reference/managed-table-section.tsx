"use client";

import { ColumnSettingsPopover } from "@/components/erp/column-settings-popover";
import { DataTable } from "@/components/erp/data-table";
import { DetailSection } from "@/components/erp/detail-section";
import {
  useManagedColumns,
  type ManagedColumn,
} from "@/components/erp/use-managed-columns";

type Row = {
  id: number;
  status: string;
  code: string;
  name: string;
  businessNumber: string;
  roles: string;
  stage: string;
};

const ROWS: Row[] = [
  {
    id: 1,
    status: "사용중",
    code: "C-0001",
    name: "가나다 상사",
    businessNumber: "123-45-67890",
    roles: "고객",
    stage: "거래중",
  },
  {
    id: 2,
    status: "사용중",
    code: "C-0002",
    name: "라마바 유통",
    businessNumber: "234-56-78901",
    roles: "고객·공급사",
    stage: "잠재고객",
  },
];

const COLUMNS: ManagedColumn<Row>[] = [
  {
    key: "status",
    header: "상태",
    defaultVisible: true,
    defaultWidth: 90,
    minWidth: 60,
    maxWidth: 160,
    render: (row) => row.status,
  },
  {
    key: "code",
    header: "코드",
    defaultVisible: true,
    defaultWidth: 110,
    minWidth: 70,
    maxWidth: 220,
    render: (row) => row.code,
  },
  {
    key: "name",
    header: "거래처명",
    defaultVisible: true,
    defaultWidth: 180,
    minWidth: 100,
    maxWidth: 360,
    render: (row) => row.name,
  },
  {
    key: "businessNumber",
    header: "사업자번호",
    defaultVisible: true,
    defaultWidth: 150,
    minWidth: 110,
    maxWidth: 260,
    render: (row) => row.businessNumber,
  },
  {
    key: "roles",
    header: "역할",
    defaultVisible: true,
    defaultWidth: 120,
    minWidth: 80,
    maxWidth: 220,
    render: (row) => row.roles,
  },
  {
    key: "stage",
    header: "단계",
    defaultVisible: true,
    defaultWidth: 110,
    minWidth: 80,
    maxWidth: 220,
    render: (row) => row.stage,
  },
];

const STORAGE_KEY = "project-management.ui-reference.partners.v1";

export function ManagedTableSection() {
  const {
    prefs,
    visibleColumns,
    columnWidths,
    toggle,
    move,
    resizeBy,
    startResize,
    reset,
    ready,
    saving,
    error,
  } = useManagedColumns(STORAGE_KEY, COLUMNS);

  return (
    <DetailSection
      actions={
        <fieldset disabled={!ready} className="m-0 border-0 p-0">
        <ColumnSettingsPopover
          columns={COLUMNS}
          onMove={move}
          onReset={reset}
          onToggle={toggle}
          prefs={prefs}
        />
        </fieldset>
      }
      title="9. 관리형 테이블 · 컬럼 표시·순서·너비"
    >
      {error ? <p role="alert" className="mb-2 text-[12px] text-[var(--bi-error)]">{error}</p> : null}
      <p role="status" className="mb-2 text-[11px] text-[var(--bi-muted)]">{!ready ? "공유 설정을 불러오는 중…" : saving ? "컬럼 설정 저장 중…" : "컬럼 설정은 모든 기기에서 공유됩니다."}</p>
      <div className="overflow-x-auto">
        <DataTable
          caption="관리형 테이블 샘플"
          columns={visibleColumns}
          columnWidths={columnWidths}
          emptyMessage="데이터가 없습니다."
          onResizeStart={ready ? startResize : undefined}
          onResizeStep={ready ? resizeBy : undefined}
          rowKey={(row) => String(row.id)}
          rows={ROWS}
        />
      </div>
    </DetailSection>
  );
}
