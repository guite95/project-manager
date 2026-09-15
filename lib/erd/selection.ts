/** 방향과 무관하게 선택 테이블에 직접 연결된 관계만 강조한다. */
export function erdSelection(
  nodeIds: string[],
  relations: { id: string; source: string; target: string }[],
  selected: string,
) {
  if (!selected || !nodeIds.includes(selected)) return null;
  const nodes = new Set([selected]);
  const edges = new Set<string>();
  for (const r of relations) {
    if (r.source !== selected && r.target !== selected) continue;
    nodes.add(r.source);
    nodes.add(r.target);
    edges.add(r.id);
  }
  return { nodes, edges };
}
