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
  ["--bi-ai", "#7C5CFF"],
  ["--bi-ai-light", "#F1EDFF"],
  ["--bi-demand", "#0F766E"],
  ["--bi-demand-light", "#E6F4F2"],
  ["--bi-stock-warn", "#B45309"],
  ["--bi-stock-warn-light", "#FDF1E3"],
];

export function TokensSection() {
  return (
    <DetailSection title="1. 토큰 팔레트">
      <div className="grid grid-cols-2 gap-0 px-6 py-4 sm:grid-cols-3">
        {TOKENS.map(([name, hex]) => (
          <div className="flex items-center gap-3 py-2 text-xs" key={name}>
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
