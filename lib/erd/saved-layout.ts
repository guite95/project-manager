import type { FlowChart } from '../../components/flow/types.ts';
import type { layoutErd } from './layout.ts';
import type { routeErd } from './routes.ts';
import { entityHeight } from './geometry.ts';

export type SavedErdLayout = {
  version: 1;
  revision: number;
  snapshotHash: string;
  savedAt: string;
  layout: ReturnType<typeof layoutErd>;
  routing: ReturnType<typeof routeErd>;
};
export const ERD_LAYOUT_PREFIX = 'erd:tns:layout:';
export function erdLayoutKey(domain: string, focus?: string) {
  return `${ERD_LAYOUT_PREFIX}${focus ? `table:${focus}` : `domain:${domain}`}`;
}

/** JSONB 경계에서 좌표·노드·관계·연결점의 완전성을 확인한다. 재배치는 하지 않는다. */
export function parseSavedErdLayout(input: unknown, chart: FlowChart): SavedErdLayout {
  const fail = (): never => { throw new Error('저장된 ERD 배치가 현재 테이블 구조와 일치하지 않습니다.'); };
  if (!input || typeof input !== 'object') return fail();
  const value = input as SavedErdLayout;
  if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      !/^[a-f0-9]{64}$/.test(value.snapshotHash) || !Number.isFinite(Date.parse(value.savedAt))) return fail();
  if (!value.layout || !Array.isArray(value.layout.nodes) || !Array.isArray(value.layout.groups) ||
      !value.routing || !Array.isArray(value.routing.routes) || !value.routing.ports) return fail();
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7;
  const validBox = (n: {x:number;y:number;width:number;height:number}) => n && finite(n.x) && finite(n.y) && finite(n.width) && finite(n.height) && n.width > 0 && n.height > 0;
  if (!finite(value.layout.width) || !finite(value.layout.height) || value.layout.width < 0 || value.layout.height < 0) return fail();
  const unique = (ids: string[]) => ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length;
  const expected = new Map(chart.nodes.map(n => [n.id, n]));
  const groups = new Map(value.layout.groups.map(g => [g.id, g]));
  if (!unique(value.layout.nodes.map(n => n.id)) || !unique(value.layout.groups.map(g => g.id)) || value.layout.nodes.length !== expected.size) return fail();
  for (const g of value.layout.groups) if (!validBox(g) || expected.has(g.id) || typeof g.label !== 'string') return fail();
  const nodes = new Map(value.layout.nodes.map(n => [n.id, n]));
  for (const n of value.layout.nodes) {
    const source = expected.get(n.id);
    const group = groups.get(n.group);
    if (!validBox(n) || !source?.data.entity || !group || n.width !== (chart.nodeWidth ?? 360) || n.height !== entityHeight(source.data.entity.fields.length) ||
        n.x < group.x || n.y < group.y || n.x + n.width > group.x + group.width || n.y + n.height > group.y + group.height) return fail();
  }
  const overlaps = (a: {x:number;y:number;width:number;height:number}, b: typeof a) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
  for (let i=0;i<value.layout.nodes.length;i++) for (let j=i+1;j<value.layout.nodes.length;j++) if (overlaps(value.layout.nodes[i],value.layout.nodes[j])) return fail();
  if (!unique(value.routing.routes.map(r => r.id)) || value.routing.routes.length !== chart.edges.length) return fail();
  const edges = new Map(chart.edges.map(e => [e.id, e]));
  if (Object.keys(value.routing.ports).length !== nodes.size) return fail();
  for (const n of value.layout.nodes) {
    const ports = value.routing.ports[n.id];
    if (!Array.isArray(ports) || !unique(ports.map(p => p.id))) return fail();
    for (const p of ports) {
      if (!['source','target'].includes(p.type) || !['left','right'].includes(p.side) || !finite(p.top) || p.top <= 0 || p.top >= n.height ||
          p.x !== n.x + (p.side === 'right' ? n.width : 0) || p.y !== n.y + p.top) return fail();
    }
  }
  for (const r of value.routing.routes) {
    const edge = edges.get(r.id);
    if (!edge || !Array.isArray(r.points) || r.points.length < 2 || r.points.some(p => !p || !finite(p.x) || !finite(p.y))) return fail();
    const from = value.routing.ports[edge.source]?.find(p => p.id === r.sourceHandle && p.type === 'source');
    const to = value.routing.ports[edge.target]?.find(p => p.id === r.targetHandle && p.type === 'target');
    if (!from || !to || r.points[0].x !== from.x || r.points[0].y !== from.y || r.points.at(-1)!.x !== to.x || r.points.at(-1)!.y !== to.y) return fail();
    for (let i=1;i<r.points.length;i++) {
      const a=r.points[i-1], b=r.points[i];
      if (a.x !== b.x && a.y !== b.y) return fail();
    }
  }
  return value;
}
