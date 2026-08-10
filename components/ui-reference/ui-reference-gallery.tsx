import { PageHeader } from "@/components/erp/page-header";
import {
  BadgesSection,
  ButtonsSection,
  TokensSection,
  TypographySection,
} from "./static-sections";

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
      <BadgesSection />
    </div>
  );
}
