type Point = { x: number; y: number };
type Table = Point & { id: string; width: number; height: number };
type Relation = { id: string; source: string; target: string };
export type ErdPort = Point & { id: string; type: 'source' | 'target'; side: 'left' | 'right'; top: number };
const CLEARANCE = 18;
const EXIT = 28;
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** 카드의 좌우 연결점을 분산하고 카드 사이의 통로로 직각 관계선을 찾는다. */
export function routeErd(tables: Table[], relations: Relation[]) {
  const byId = new Map(tables.map(t => [t.id, t]));
  const edges = [...relations].filter(e => byId.has(e.source) && byId.has(e.target))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ports: Record<string, ErdPort[]> = Object.fromEntries(tables.map(t => [t.id, []]));
  const endpoints = edges.map(e => {
    const source = byId.get(e.source)!;
    const target = byId.get(e.target)!;
    const forward = target.x > source.x;
    const from: ErdPort = { id: `source:${e.id}`, type: 'source', side: forward || source.x === target.x ? 'right' : 'left', x: 0, y: 0, top: 0 };
    const to: ErdPort = { id: `target:${e.id}`, type: 'target', side: forward ? 'left' : 'right', x: 0, y: 0, top: 0 };
    ports[source.id].push(from);
    ports[target.id].push(to);
    return { edge: e, from, to };
  });
  for (const table of tables) for (const side of ['left', 'right'] as const) {
    const sameSide = ports[table.id].filter(p => p.side === side);
    sameSide.forEach((p, i) => {
      p.top = (i + 1) / (sameSide.length + 1) * table.height;
      p.x = table.x + (side === 'right' ? table.width : 0);
      p.y = table.y + p.top;
    });
  }
  const anchor = (p: ErdPort) => ({ x: p.x + (p.side === 'right' ? EXIT : -EXIT), y: p.y });
  const obstacles = tables.map(t => ({ x: t.x - CLEARANCE, y: t.y - CLEARANCE, width: t.width + CLEARANCE * 2, height: t.height + CLEARANCE * 2 }));
  const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  const xs = unique(tables.flatMap(t => [t.x - EXIT, t.x + t.width + EXIT]));
  const ys = unique([...tables.flatMap(t => [t.y - EXIT, t.y + t.height + EXIT]), ...endpoints.flatMap(e => [e.from.y, e.to.y])]);
  const points = ys.flatMap(y => xs.map(x => ({ x, y })));
  const inside = (p: Point) => obstacles.some(o => p.x > o.x && p.x < o.x + o.width && p.y > o.y && p.y < o.y + o.height);
  const blocked = points.map(inside);
  const crosses = (a: Point, b: Point) => obstacles.some(o => a.x === b.x
    ? a.x > o.x && a.x < o.x + o.width && Math.max(a.y, b.y) > o.y && Math.min(a.y, b.y) < o.y + o.height
    : a.y > o.y && a.y < o.y + o.height && Math.max(a.x, b.x) > o.x && Math.min(a.x, b.x) < o.x + o.width);
  const neighbors = points.map((p, i) => {
    if (blocked[i]) return [];
    const column = i % xs.length;
    return [column ? i - 1 : -1, column + 1 < xs.length ? i + 1 : -1, i - xs.length, i + xs.length]
      .filter(j => j >= 0 && j < points.length && !blocked[j] && !crosses(p, points[j]));
  });
  const pointId = (p: Point) => ys.indexOf(p.y) * xs.length + xs.indexOf(p.x);
  const used = new Map<string, number>();
  const segmentKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const routes = endpoints.map(({ edge, from, to }) => {
    const start = pointId(anchor(from));
    const end = pointId(anchor(to));
    const costs = new Float64Array(points.length * 3).fill(Infinity);
    const parent = new Int32Array(points.length * 3).fill(-1);
    const queue = new MinQueue();
    const startState = start * 3;
    costs[startState] = 0;
    queue.push({ state: startState, cost: 0, priority: distance(points[start], points[end]) });
    let final = -1;
    while (queue.length) {
      const current = queue.pop()!;
      if (current.cost !== costs[current.state]) continue;
      const id = Math.floor(current.state / 3);
      if (id === end) { final = current.state; break; }
      const previousAxis = current.state % 3;
      for (const next of neighbors[id]) {
        const axis = points[id].x === points[next].x ? 2 : 1;
        const nextState = next * 3 + axis;
        const cost = current.cost + distance(points[id], points[next]) +
          (previousAxis && previousAxis !== axis ? 24 : 0) + (used.get(segmentKey(id, next)) ?? 0) * 6;
        if (cost >= costs[nextState]) continue;
        costs[nextState] = cost;
        parent[nextState] = current.state;
        queue.push({ state: nextState, cost, priority: cost + distance(points[next], points[end]) });
      }
    }
    if (final < 0) throw new Error(`ERD 관계 경로를 찾지 못했습니다: ${edge.id}`);
    const pathIds: number[] = [];
    for (let cursor = final; cursor >= 0; cursor = parent[cursor]) pathIds.push(Math.floor(cursor / 3));
    pathIds.reverse();
    for (let i = 1; i < pathIds.length; i++) {
      const key = segmentKey(pathIds[i - 1], pathIds[i]);
      used.set(key, (used.get(key) ?? 0) + 1);
    }
    const path = [{ x: from.x, y: from.y }, ...pathIds.map(id => points[id]), { x: to.x, y: to.y }];
    const simplified: Point[] = [];
    for (const p of path) {
      const a = simplified.at(-2), b = simplified.at(-1);
      if (b && b.x === p.x && b.y === p.y) continue;
      if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) simplified.pop();
      simplified.push(p);
    }
    return { id: edge.id, sourceHandle: from.id, targetHandle: to.id, points: simplified };
  });
  return { routes, ports };
}

type QueueItem = { state: number; cost: number; priority: number };
/** 경로 탐색 중 후보 전체를 반복 정렬하지 않도록 최소 힙을 사용한다. */
class MinQueue {
  private items: QueueItem[] = [];
  get length() { return this.items.length; }
  push(item: QueueItem) {
    let index = this.items.push(item) - 1;
    while (index) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].priority <= item.priority) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].priority < this.items[child].priority) child++;
        if (last.priority <= this.items[child].priority) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}
