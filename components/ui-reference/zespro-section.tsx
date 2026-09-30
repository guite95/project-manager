"use client";

import { useState } from "react";
import { HiOutlineTableCells, HiOutlineViewColumns } from "react-icons/hi2";
import { Button } from "@/components/erp/button";
import { Checkbox } from "@/components/erp/checkbox";
import { ConfirmDialogProvider, useConfirm } from "@/components/erp/confirm-dialog";
import { DetailSection } from "@/components/erp/detail-section";
import { ListToolbar } from "@/components/erp/list-toolbar";
import { SegmentedFilter } from "@/components/erp/segmented-filter";
import { StageNumber } from "@/components/erp/stage-number";
import { StatusBadge } from "@/components/erp/status-badge";
import { ViewModeToggle } from "@/components/erp/view-mode-toggle";
import {
  ActionMenu, AppSidebar, DualSidebar, ClassificationTree,
  DataGrid, DataGridTable,  DataGridFooter,
  ExecutiveDashboard, ExecutiveDashboardKpi, ExecutiveDashboardKpiGrid,
  ExecutiveDashboardNotice, FieldGrid, FormModal, ChoiceGrid, ChoiceCard,
  CheckTileGroup, CheckTile, SplitLoginLayout, SplitModal, SplitModalSection,
  Tabs, TopLoadingBar,
} from "@/components/erp/zespro";

function Samples() {
  const [tab, setTab] = useState("overview");
  const [stage, setStage] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "board">("table");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("work");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [checked, setChecked] = useState(false);
  const [choice, setChoice] = useState("personal");
  const [form, setForm] = useState(false);
  const [split, setSplit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("항목을 선택해 보세요.");
  const { confirm, alert } = useConfirm();
  const tabs = [{ key: "overview", label: "개요" }, { key: "history", label: "이력" }];
  const rows = ["프로젝트 정리", "자료 검토"].filter((name) => name.includes(search));

  return (
    <DetailSection title="Zespro에서 가져온 컴포넌트">
      <div className="flex flex-col gap-5 px-6 py-4">
        <p className="text-[12px] text-[var(--bi-muted)]">메뉴·목록 도구·선택 카드·분할 레이아웃 예시입니다.</p>
        <Tabs ariaLabel="예시 콘텐츠" items={tabs} value={tab} onChange={setTab} />
        <FieldGrid items={tab === "overview" ? [{ label: "프로젝트", value: "샘플 프로젝트" }, { label: "담당", value: "샘플 담당자" }] : [{ label: "최근 변경", value: "자료 검토 완료" }]} />
        <Tabs ariaLabel="예시 모드" items={tabs} value={tab} onChange={setTab} variant="segmented" />
        <ListToolbar wrap meta={`${rows.length}건`} search={{ value: search, onChange: setSearch, placeholder: "작업 검색" }} tools={
          <ViewModeToggle aria-label="보기 방식" showLabel value={view} onChange={setView} items={[
            { key: "table", label: "표", icon: <HiOutlineTableCells /> },
            { key: "board", label: "보드", icon: <HiOutlineViewColumns /> },
          ]} />} >
          <SegmentedFilter aria-label="진행 단계" clearable value={stage} onChange={setStage} items={[
            { key: "pending", label: <><StageNumber value={1} active={stage === "pending"} />대기</>, count: 2 },
            { key: "ready", label: <><StageNumber value={2} active={stage === "ready"} />완료</>, count: 0 },
          ]} />
        </ListToolbar>
        {view === "table" ? <DataGrid minWidth={400}><DataGridTable>
          <thead><tr><th>작업</th><th>상태</th><th><span className="sr-only">작업 메뉴</span></th></tr></thead>
          <tbody>{rows.map((name) => <tr key={name}><td>{name}</td><td><StatusBadge variant={stage === "ready" ? "ready" : "pending"}>{stage === "ready" ? "완료" : "대기"}</StatusBadge></td><td className="pds-td--actions"><ActionMenu ariaLabel={`${name} 메뉴`} items={[{ key: "detail", label: "상세 보기", onSelect: () => setSplit(true) }, { key: "notice", label: "알림", onSelect: () => { void alert({ message: `${name} 선택` }); } }]} /></td></tr>)}</tbody>
        </DataGridTable><DataGridFooter stats={[{ label: "작업", value: `${rows.length}건` }]} /></DataGrid> : <div className="grid gap-2 sm:grid-cols-2">{rows.map((name) => <Button key={name} variant="secondary" onClick={() => setSplit(true)}>{name}</Button>)}</div>}
        {rows.length === 0 && <p role="status">검색 결과가 없습니다.</p>}
        <ClassificationTree selectedId={selected} collapsedIds={collapsed} onSelect={(node) => setSelected(node.id)} onCollapsedChange={(id, close) => setCollapsed((previous) => { const next = new Set(previous); if (close) next.add(id); else next.delete(id); return next; })} nodes={[{ id: "work", label: "작업", children: [{ id: "materials", label: "자료", count: 2 }] }]} />
        <div className="flex flex-wrap gap-3"><Checkbox label="선택" checked={checked} onChange={setChecked} /><Checkbox ariaLabel="일부 선택 예시" checked={false} indeterminate onChange={setChecked} /><StatusBadge variant="ready">완료</StatusBadge><StatusBadge variant="blocked">차단</StatusBadge></div>
        <div className="pds"><ChoiceGrid label="프로젝트 유형"><ChoiceCard title="개인" selected={choice === "personal"} onSelect={() => setChoice("personal")} /><ChoiceCard title="회사" selected={choice === "company"} onSelect={() => setChoice("company")} /></ChoiceGrid><CheckTileGroup label="포함할 자료"><CheckTile label="문서 포함" checked={checked} onToggle={() => setChecked(!checked)} /></CheckTileGroup></div>
        <div className="relative flex flex-wrap gap-2 border border-[var(--bi-border)] p-4">
          <TopLoadingBar active={loading} variant="local" />
          <Button onClick={() => setForm(true)}>폼 모달</Button><Button variant="secondary" onClick={() => setSplit(true)}>분할 상세 모달</Button>
          <Button variant="secondary" onClick={() => setLoading(!loading)}>{loading ? "로딩 종료" : "상단 로딩"}</Button>
          <Button variant="secondary" onClick={async () => setMessage(await confirm({ message: "계속 진행할까요?" }) ? "확인 선택" : "취소 선택")}>확인 다이얼로그</Button>
          <span role="status">{message}</span>
        </div>
        <ExecutiveDashboard><ExecutiveDashboardNotice tone="info">샘플 지표입니다.</ExecutiveDashboardNotice><ExecutiveDashboardKpiGrid columns={3}><ExecutiveDashboardKpi label="전체 작업" value="2건" /><ExecutiveDashboardKpi label="진행 중" value="2건" /><ExecutiveDashboardKpi label="완료" value="0건" /></ExecutiveDashboardKpiGrid></ExecutiveDashboard>
        <div className="flex flex-wrap gap-4">
          <AppSidebar title="단일 사이드바" groups={[{ title: "작업", items: [{ label: "레퍼런스", href: "#zespro-components", active: true }] }]} />
          <DualSidebar groups={[{ railLabel: "작업", title: "이중 사이드바", items: [{ label: "레퍼런스", href: "#zespro-components", active: true }] }]} />
        </div>
        <SplitLoginLayout className="zespro-login-preview" heroMedia={<div className="h-full bg-[var(--bi-accent)]" />} heroContent={<p className="text-white">프로젝트 관리</p>} brand="분할 로그인 레이아웃" footer="레이아웃 예시">
          <p>로그인 폼을 넣을 수 있는 영역입니다.</p>
        </SplitLoginLayout>
      </div>
      <FormModal open={form} onClose={() => setForm(false)} onSubmit={() => { setForm(false); setMessage("예시 폼 제출 완료"); }} title="예시 입력"><label className="flex flex-col gap-2">작업명<input className="border border-[var(--bi-border)] p-2" data-autofocus defaultValue="자료 검토" /></label></FormModal>
      <SplitModal open={split} onClose={() => setSplit(false)} ariaLabel="샘플 작업 상세" profile={{ title: "샘플 작업" }} facts={[{ label: "담당", value: "샘플 담당자" }]} tabs={tabs} tab={tab} onTabChange={setTab} tabsAriaLabel="작업 상세"><SplitModalSection title={tab === "overview" ? "개요" : "이력"}><FieldGrid items={[{ label: "내용", value: tab === "overview" ? "자료를 검토합니다." : "작업이 등록되었습니다." }]} /></SplitModalSection></SplitModal>
    </DetailSection>
  );
}

export function ZesproSection() {
  return <div id="zespro-components"><ConfirmDialogProvider><Samples /></ConfirmDialogProvider></div>;
}
