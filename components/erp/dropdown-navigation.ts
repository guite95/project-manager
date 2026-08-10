export type DropdownKeyAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "move"; index: number }
  | { type: "choose"; index: number };

export function resolveDropdownKey(
  key: string,
  open: boolean,
  activeIndex: number,
  optionCount: number,
): DropdownKeyAction | null {
  if (!open) {
    return key === "ArrowDown" || key === "ArrowUp" ? { type: "open" } : null;
  }
  if (key === "Escape") return { type: "close" };
  if (optionCount === 0) return null;
  if (key === "ArrowDown") {
    return { type: "move", index: (activeIndex + 1) % optionCount };
  }
  if (key === "ArrowUp") {
    return {
      type: "move",
      index: (activeIndex - 1 + optionCount) % optionCount,
    };
  }
  if (key === "Enter" && activeIndex >= 0 && activeIndex < optionCount) {
    return { type: "choose", index: activeIndex };
  }
  return null;
}
