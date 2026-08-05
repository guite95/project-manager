import { KIND_STYLE } from "./kind-style";
import type { FlowChart, NodeKind } from "./types";

/* -------------------------------------------------------------------------
 * 색 체계 범례.
 *
 * 차트를 받으면 그 차트가 실제로 쓴 kind·엣지만 보여준다.
 * 안 쓰는 색까지 나열하면 범례가 오히려 방해가 된다.
 * ---------------------------------------------------------------------- */

const EDGE_LEGEND: Record<string, { label: string; cls: string }> = {
  impl: {
    label: "확정 흐름",
    cls: "border-t-[1.8px] border-[var(--bi-accent)]",
  },
  ref: {
    label: "참조·공급·환류",
    cls: "border-t-[1.5px] border-dashed border-[var(--bi-edge-muted)]",
  },
  future: {
    label: "예정 흐름",
    cls: "border-t-[1.6px] border-dashed border-[var(--bi-accent)]",
  },
  snapshot: {
    label: "시점 배치·마감",
    cls: "border-t-[1.8px] border-dotted border-[var(--bi-success)]",
  },
  master: {
    label: "기준정보 참조",
    cls: "border-t border-dashed border-[var(--bi-edge-muted)]",
  },
};

function Swatch({ kind }: { kind: NodeKind }) {
  const s = KIND_STYLE[kind];
  return (
    <span
      className="h-4 w-7 shrink-0 rounded-[2px]"
      style={{
        backgroundColor: s.bg,
        border: `${s.borderWidth}px ${s.borderStyle} ${s.border}`,
      }}
    />
  );
}

export function FlowLegend({ chart }: { chart: FlowChart }) {
  // 선언 순서를 유지하면서 중복 제거
  const kinds = [...new Set(chart.nodes.map((n) => n.data.kind))];
  const edgeKinds = [...new Set(chart.edges.map((e) => e.kind))].filter(
    (k) => k in EDGE_LEGEND
  );

  const hasTiming = chart.nodes.some((n) => n.data.timing);
  const hasDoc = chart.nodes.some((n) => n.data.doc);

  return (
    <div className="rounded border border-[var(--bi-border)] bg-[var(--bi-sidebar-bg)] px-3 py-2.5">
      <div className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-[var(--bi-muted)] uppercase">
        범례
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {kinds.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <Swatch kind={k} />
            <span className="text-[11px] text-[var(--bi-fg)]">
              {KIND_STYLE[k].title}
              <span className="ml-1 text-[var(--bi-muted)]">
                — {KIND_STYLE[k].desc}
              </span>
            </span>
          </div>
        ))}
      </div>

      {edgeKinds.length ? (
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--bi-border)] pt-2.5">
          {edgeKinds.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className={`w-7 shrink-0 ${EDGE_LEGEND[k].cls}`} />
              <span className="text-[11px] text-[var(--bi-fg)]">
                {EDGE_LEGEND[k].label}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {hasTiming || hasDoc ? (
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--bi-border)] pt-2.5">
          {hasTiming ? (
            <div className="flex items-center gap-2">
              <span className="rounded-[2px] bg-[var(--bi-success)] px-1.5 py-px text-[9px] font-bold text-white">
                ⏱ 시점
              </span>
              <span className="text-[11px] text-[var(--bi-muted)]">
                이 단계가 도는 주기·마감
              </span>
            </div>
          ) : null}
          {hasDoc ? (
            <div className="flex items-center gap-2">
              <span className="rounded-[2px] bg-[var(--bi-doc)] px-1.5 py-px text-[9px] font-bold text-white">
                📄 산출물
              </span>
              <span className="text-[11px] text-[var(--bi-muted)]">
                이 시점에 만들어지는 문서
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
