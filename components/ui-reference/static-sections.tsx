import { Badge, type BadgeVariant } from "@/components/erp/badge";
import { Button, type ButtonVariant } from "@/components/erp/button";
import { DetailSection } from "@/components/erp/detail-section";

const TOKENS = [
  ["--bi-accent", "#1B2A4A"],
  ["--bi-accent-light", "#E8EDF5"],
  ["--bi-bg", "#FFFFFF"],
  ["--bi-fg", "#0A0A0A"],
  ["--bi-muted", "#666666"],
  ["--bi-border", "#EAEAEA"],
  ["--bi-sidebar-bg", "#FAFAFA"],
  ["--bi-success", "#10B981"],
  ["--bi-warning", "#F5A623"],
  ["--bi-error", "#EE0000"],
] as const;

const TYPE_LEVELS = [
  { label: "Page Title · 16/700", className: "text-base font-bold" },
  {
    label: "Section Title · 13/600",
    className: "text-[13px] font-semibold",
  },
  { label: "Body · 12/400", className: "text-[12px]" },
  { label: "Body Strong · 12/600", className: "text-[12px] font-semibold" },
  {
    label: "KPI Figure · 22/700",
    className: "text-[22px] font-bold tabular-nums",
  },
  {
    label: "Caption · 11/500",
    className: "text-[11px] font-medium tracking-[0.02em]",
  },
  {
    label: "Overline · 10/600",
    className: "text-[10px] font-semibold tracking-[0.05em] uppercase",
  },
] as const;

const BUTTON_VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "destructive",
];
const BADGE_VARIANTS: BadgeVariant[] = [
  "primary",
  "success",
  "warning",
  "error",
  "neutral",
];

export function TokensSection() {
  return (
    <DetailSection title="1. 토큰 팔레트">
      <div className="grid grid-cols-2 px-6 py-4 sm:grid-cols-3">
        {TOKENS.map(([name, hex]) => (
          <div className="flex items-center gap-3 py-2 text-[12px]" key={name}>
            <span
              className="h-8 w-8 rounded-[4px] border border-[var(--bi-border)]"
              style={{ background: `var(${name})` }}
            />
            <span className="font-mono">
              {name}
              <br />
              <span className="text-[var(--bi-muted)]">{hex}</span>
            </span>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

export function TypographySection() {
  return (
    <DetailSection title="2. 타이포그래피">
      <div className="flex flex-col gap-3 px-6 py-4">
        {TYPE_LEVELS.map((level) => (
          <div key={level.label}>
            <p className="text-[10px] text-[var(--bi-muted)]">{level.label}</p>
            <p className={level.className}>
              다람쥐 헌 쳇바퀴에 타고파 1234567890
            </p>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

export function ButtonsSection() {
  return (
    <DetailSection title="3. 버튼">
      <div className="flex flex-col gap-4 px-6 py-4">
        {BUTTON_VARIANTS.map((variant) => (
          <div className="flex flex-wrap items-center gap-3" key={variant}>
            <span className="w-24 text-[11px] text-[var(--bi-muted)]">
              {variant}
            </span>
            <Button variant={variant}>기본</Button>
            <Button size="sm" variant={variant}>
              sm
            </Button>
            <Button disabled variant={variant}>
              disabled
            </Button>
            <Button loading variant={variant}>
              loading
            </Button>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

export function BadgesSection() {
  return (
    <DetailSection title="5. 배지">
      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </div>
    </DetailSection>
  );
}
