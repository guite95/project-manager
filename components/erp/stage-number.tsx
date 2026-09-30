"use client";

// 단계형 상태 필터 칩의 번호 태그. 텍스트 "1."이 아니라 작은 배경색 태그로 그려
// 진행 순서가 시각적으로 읽히게 한다. DESIGN.md: 그림자 없음, radius 0~4px.
export function StageNumber({ value, active = false }: { value: number; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1 text-[10px] font-bold leading-none tabular-nums",
        active
          ? "bg-[var(--bi-accent)] text-white"
          : "bg-[var(--bi-sidebar-active)] text-[var(--bi-muted)]",
      ].join(" ")}
    >
      {value}
    </span>
  );
}
