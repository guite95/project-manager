/** 기존 기본 배치. 저장 후에는 DB 프로젝트와 외부 프로젝트를 같은 순서로 다룬다. */
export function defaultSidebarOrder(flowSlugs: string[], externalSlugs: string[]): string[] {
  return [...new Set([
    ...flowSlugs.filter((slug) => slug !== "jespro"),
    ...externalSlugs,
    ...flowSlugs.filter((slug) => slug === "jespro"),
  ])];
}

/** 삭제된 프로젝트와 중복을 제거하고, 이후 추가된 프로젝트는 기본 순서대로 붙인다. */
export function normalizeSidebarOrder(defaultOrder: string[], saved: unknown): string[] {
  const known = new Set(defaultOrder);
  const preferred = Array.isArray(saved)
    ? saved.filter((slug): slug is string => typeof slug === "string" && known.has(slug))
    : [];
  return [...new Set([...preferred, ...defaultOrder])];
}

export function moveSidebarProject(
  order: string[],
  slug: string,
  target: string,
  edge: "before" | "after",
): string[] {
  if (slug === target || !order.includes(slug) || !order.includes(target)) return order;
  const next = order.filter((entry) => entry !== slug);
  next.splice(next.indexOf(target) + (edge === "after" ? 1 : 0), 0, slug);
  return next.every((entry, index) => entry === order[index]) ? order : next;
}
