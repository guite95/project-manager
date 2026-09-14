import { Button } from "@/components/erp/button";
import { DetailSection } from "@/components/erp/detail-section";

const VARIANTS = ["primary", "secondary", "ghost", "destructive"] as const;

export function ButtonsSection() {
  return (
    <DetailSection title="3. 버튼">
      <div className="flex flex-col gap-4 px-6 py-4">
        {VARIANTS.map((variant) => (
          <div className="flex items-center gap-3" key={variant}>
            <span className="w-24 text-[11px] text-[var(--bi-muted)]">{variant}</span>
            <Button variant={variant}>기본</Button>
            <Button size="sm" variant={variant}>sm</Button>
            <Button disabled variant={variant}>disabled</Button>
            <Button loading variant={variant}>loading</Button>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
