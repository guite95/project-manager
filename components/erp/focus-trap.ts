export function resolveFocusTrapTarget({
  inside,
  atFirst,
  atLast,
  shiftKey,
}: {
  inside: boolean;
  atFirst: boolean;
  atLast: boolean;
  shiftKey: boolean;
}): "first" | "last" | null {
  if (!inside) return shiftKey ? "last" : "first";
  if (shiftKey && atFirst) return "last";
  if (!shiftKey && atLast) return "first";
  return null;
}
