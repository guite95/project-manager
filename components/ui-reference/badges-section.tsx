import { Badge } from "@/components/erp/badge";
import { DetailSection } from "@/components/erp/detail-section";

const VARIANTS = [
  "primary",
  "success",
  "warning",
  "error",
  "neutral",
  "ai",
  "demand",
  "stockWarn",
] as const;

export function BadgesSection() {
  return (
    <DetailSection title="6. 배지">
      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        {VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </div>
    </DetailSection>
  );
}
