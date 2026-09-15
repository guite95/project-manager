export type ErdLayoutTable = {
  id: string;
  width: number;
  height: number;
  domain: string;
  external: boolean;
};
type Relation = { source: string; target: string };
type Box = { x: number; y: number; width: number; height: number };
type PlacedTable = ErdLayoutTable & Box & { group: string };
type Group = Box & { id: string; label: string; external: boolean };

const GAP = 72;
const PAD = 40;
const GROUP_GAP = 100;
const MAX_MEMBERS = 6;
const compareId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** 연결이 가까운 테이블을 작은 묶음으로 나누고 화면 비율에 맞춰 배치한다. */
export function layoutErd(tables: ErdLayoutTable[], relations: Relation[], aspectRatio = 1.6) {
  if (!tables.length) return { nodes: [] as PlacedTable[], groups: [] as Group[], width: 0, height: 0 };
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1.6;
  const sorted = [...tables].sort(compareId);
  const adjacency = new Map(sorted.map(n => [n.id, new Set<string>()]));
  for (const r of relations) {
    if (r.source === r.target || !adjacency.has(r.source) || !adjacency.has(r.target)) continue;
    adjacency.get(r.source)!.add(r.target);
    adjacency.get(r.target)!.add(r.source);
  }
  const degree = (id: string) => adjacency.get(id)!.size;
  const pending = new Set(sorted.map(n => n.id));
  const clusters: ErdLayoutTable[][] = [];
  while (pending.size) {
    const candidates = sorted.filter(n => pending.has(n.id)).sort((a, b) =>
      Number(a.external) - Number(b.external) || degree(b.id) - degree(a.id) || compareId(a, b));
    const seed = candidates[0];
    const members = [seed];
    pending.delete(seed.id);
    while (members.length < MAX_MEMBERS) {
      const affinity = (n: ErdLayoutTable) => members.reduce((sum, m) => sum + Number(adjacency.get(n.id)!.has(m.id)), 0);
      const next = candidates.filter(n => pending.has(n.id) && n.external === seed.external &&
        (!seed.external || n.domain === seed.domain))
        .sort((a, b) => affinity(b) - affinity(a) || degree(b.id) - degree(a.id) || compareId(a, b))[0];
      // 참조 대상과 고립 테이블은 같은 영역끼리 모으되 독립 업무 관계는 섞지 않는다.
      if (!next || (!seed.external && affinity(next) === 0 && (degree(seed.id) || degree(next.id)))) break;
      members.push(next);
      pending.delete(next.id);
    }
    clusters.push(members);
  }

  const blocks = clusters.map(members => {
    const seed = members[0];
    const cellWidth = Math.max(...members.map(n => n.width));
    const cellHeight = Math.max(...members.map(n => n.height));
    const choices = Array.from({ length: Math.min(3, members.length) }, (_, i) => {
      const columns = i + 1;
      const rows = Math.ceil(members.length / columns);
      const width = columns * cellWidth + (columns - 1) * GAP + 2 * PAD;
      const height = rows * cellHeight + (rows - 1) * GAP + 2 * PAD;
      return { columns, rows, width, height, score: Math.abs(Math.log(width / height / ratio)) + (columns * rows - members.length) * 0.12 };
    }).sort((a, b) => a.score - b.score);
    const grid = choices[0];
    const slots = Array.from({ length: grid.columns * grid.rows }, (_, i) => ({
      x: PAD + (i % grid.columns) * (cellWidth + GAP),
      y: PAD + Math.floor(i / grid.columns) * (cellHeight + GAP),
    }));
    let groupId = `erd-group:${seed.id}`;
    while (adjacency.has(groupId)) groupId = `_${groupId}`;
    const nodes: PlacedTable[] = [];
    for (const member of members) {
      const connected = nodes.filter(n => adjacency.get(member.id)!.has(n.id));
      const score = (slot: { x: number; y: number }) => connected.length
        ? connected.reduce((sum, n) => sum + Math.abs(slot.x - n.x) + Math.abs(slot.y - n.y), 0)
        : Math.abs(slot.x + cellWidth / 2 - grid.width / 2) + Math.abs(slot.y + cellHeight / 2 - grid.height / 2);
      slots.sort((a, b) => score(a) - score(b) || a.y - b.y || a.x - b.x);
      nodes.push({ ...member, ...slots.shift()!, group: groupId });
    }
    return {
      id: groupId, width: grid.width, height: grid.height, nodes, external: seed.external,
      label: seed.external ? `${seed.domain} · 참조 ${members.length}개` : `${seed.id} 주변 · ${members.length}개`,
    };
  });

  // 여러 폭으로 선반 배치를 비교한다. 종횡비와 빈 공간을 함께 고려한다.
  const minWidth = Math.max(...blocks.map(b => b.width));
  const maxWidth = blocks.reduce((sum, b) => sum + b.width + GROUP_GAP, 0);
  const area = blocks.reduce((sum, b) => sum + b.width * b.height, 0);
  let best: { nodes: PlacedTable[]; groups: Group[]; width: number; height: number; score: number } | undefined;
  for (let limit = minWidth; limit <= maxWidth + minWidth / 4; limit += minWidth / 4) {
    let x = 0, y = 0, rowHeight = 0, width = 0;
    const nodes: PlacedTable[] = [];
    const groups: Group[] = [];
    for (const block of blocks) {
      if (x && x + block.width > limit) { x = 0; y += rowHeight + GROUP_GAP; rowHeight = 0; }
      groups.push({ id: block.id, label: block.label, external: block.external, x, y, width: block.width, height: block.height });
      nodes.push(...block.nodes.map(n => ({ ...n, x: n.x + x, y: n.y + y })));
      width = Math.max(width, x + block.width);
      rowHeight = Math.max(rowHeight, block.height);
      x += block.width + GROUP_GAP;
    }
    const height = y + rowHeight;
    const score = Math.abs(Math.log(width / height / ratio)) * 2 + (width * height / area - 1) * 0.35;
    if (!best || score < best.score) best = { nodes, groups, width, height, score };
  }
  const { score: _score, ...result } = best!;
  return result;
}
