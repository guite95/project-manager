import { PageHeader } from "@/components/erp/page-header";
import { FormsSection } from "./forms-section";
import { DatePickerSection } from "./date-picker-section";
import { FilterPanelSection } from "./filter-panel-section";
import { LoadingSection } from "./loading-section";
import { ManagedTableSection } from "./managed-table-section";
import { ModalDemoSection } from "./modal-demo-section";
import { BadgesSection } from "./badges-section";
import { ButtonsSection } from "./buttons-section";
import { TokensSection } from "./tokens-section";
import { TypographySection } from "./typography-section";
import { TableFilterSection } from "./table-filter-section";

export function UiReferenceGallery() {
  return (
    <div className="border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <PageHeader
        description="FocusAI의 입력폼, 날짜·기간 선택, 필터, 테이블, 상세 모달과 로딩 상태를 직접 확인할 수 있습니다."
        title="UI 컴포넌트 레퍼런스"
      />
      <TokensSection />
      <TypographySection />
      <ButtonsSection />
      <FormsSection />
      <DatePickerSection />
      <BadgesSection />
      <TableFilterSection />
      <FilterPanelSection />
      <ManagedTableSection />
      <ModalDemoSection />
      <LoadingSection />
    </div>
  );
}
