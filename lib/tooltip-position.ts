export type TooltipRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type TooltipSize = {
  width: number;
  height: number;
};

export function calculateTooltipPosition(
  trigger: TooltipRect,
  tooltip: TooltipSize,
  viewport: TooltipSize,
): { left: number; top: number } {
  const margin = 8;
  const gap = 6;
  const centeredLeft = (trigger.left + trigger.right - tooltip.width) / 2;
  const left = Math.min(
    Math.max(margin, centeredLeft),
    Math.max(margin, viewport.width - tooltip.width - margin),
  );
  const belowTop = trigger.bottom + gap;
  const top =
    belowTop + tooltip.height <= viewport.height - margin
      ? belowTop
      : Math.max(margin, trigger.top - tooltip.height - gap);

  return { left, top };
}
