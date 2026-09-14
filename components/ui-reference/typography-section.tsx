import { DetailSection } from "@/components/erp/detail-section";

const LEVELS: { label: string; className: string }[] = [
  { label: "Page Title · 16/700", className: "text-base font-bold" },
  { label: "Section Title · 13/600", className: "text-[13px] font-semibold" },
  { label: "Body · 12/400", className: "text-xs" },
  { label: "Body Strong · 12/600", className: "text-xs font-semibold" },
  { label: "KPI Figure · 22/700", className: "text-[22px] font-bold tabular-nums" },
  { label: "Caption · 11/500", className: "text-[11px] font-medium tracking-[0.02em]" },
  { label: "Overline · 10/600", className: "text-[10px] font-semibold uppercase tracking-[0.05em]" },
];

export function TypographySection() {
  return (
    <DetailSection title="2. 타이포그래피">
      <div className="flex flex-col gap-3 px-6 py-4">
        {LEVELS.map((level) => (
          <div key={level.label}>
            <p className="text-[10px] text-[var(--bi-muted)]">{level.label}</p>
            <p className={level.className}>다람쥐 헌 쳇바퀴에 타고파 1234567890</p>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
