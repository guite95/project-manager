import { PageHeader } from "@/components/erp/page-header";
import { FormsSection } from "./forms-section";
import { ManagedTableSection } from "./managed-table-section";
import { ModalDemoSection } from "./modal-demo-section";
import {
  BadgesSection,
  ButtonsSection,
  TokensSection,
  TypographySection,
} from "./static-sections";
import { TableFilterSection } from "./table-filter-section";

export function UiReferenceGallery() {
  return (
    <div className="overflow-hidden border border-[var(--bi-border)] bg-[var(--bi-card-bg)]">
      <PageHeader
        description="FocusAI 형태를 현재 프로젝트 색상 토큰으로 렌더링한 로컬 동작 예시입니다."
        title="UI 컴포넌트 레퍼런스"
      />
      <TokensSection />
      <TypographySection />
      <ButtonsSection />
      <FormsSection />
      <BadgesSection />
      <TableFilterSection />
      <ManagedTableSection />
      <ModalDemoSection />
    </div>
  );
}
