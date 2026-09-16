import { validateProjectContent } from "./content.ts";
import type { FlowChart } from '../../components/flow/types.ts';

const nodeKinds = new Set(['intake','core','master','future','entry','model','deterministic','verify','gate','activate','store','failure']);
const edgeKinds = new Set(['impl','ref','future','master','snapshot']);
export class FlowDocumentError extends Error {}
function requireValue(ok: unknown, path: string): asserts ok {
  if (!ok) throw new FlowDocumentError(`올바르지 않은 플로우차트 JSON: ${path}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), path);
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string) {
  requireValue(typeof value === 'string' && value.trim().length > 0, path);
}
function optionalString(value: unknown, path: string) {
  requireValue(value === undefined || typeof value === 'string', path);
}
function strings(value: unknown, path: string) {
  requireValue(Array.isArray(value) && value.every(v => typeof v === 'string'), path);
}
function uniqueRows(value: unknown, path: string) {
  requireValue(Array.isArray(value), path);
  const rows = value.map((v, i) => object(v, `${path}[${i}]`));
  const ids = new Set<string>();
  for (const row of rows) {
    string(row.id, `${path}.id`);
    requireValue(!ids.has(row.id as string), `${path}: 중복 id`);
    ids.add(row.id as string);
  }
  return { rows, ids };
}

/** Runtime JSON boundary; reject invalid references before layout can hide them. */
export function parseFlowChart(value: unknown): FlowChart {
  const c = object(value, 'chart');
  requireValue(typeof c.slug === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(c.slug), 'slug');
  string(c.title, 'title');
  for (const key of ['description','caption','erdDomain']) optionalString(c[key], key);
  if (c.howToRead !== undefined) strings(c.howToRead, 'howToRead');
  for (const key of ['direction','groupDirection']) requireValue(c[key] === undefined || c[key] === 'LR' || c[key] === 'TB', key);
  requireValue(c.nodeWidth === undefined || (typeof c.nodeWidth === 'number' && Number.isFinite(c.nodeWidth) && c.nodeWidth > 0), 'nodeWidth');
  if (c.content !== undefined) {
    try { validateProjectContent(c.content); } catch { throw new FlowDocumentError('프로젝트 콘텐츠 형식이 올바르지 않습니다.'); }
  }
  if (c.source !== undefined) {
    const source = object(c.source, 'source');
    string(source.url, 'source.url'); string(source.capturedAt, 'source.capturedAt');
    try { requireValue(new URL(source.url as string).protocol === 'https:', 'source.url'); }
    catch { throw new FlowDocumentError('출처 URL이 올바르지 않습니다.'); }
  }
  const groups = uniqueRows(c.groups ?? [], 'groups');
  const nodes = uniqueRows(c.nodes, 'nodes');
  const edges = uniqueRows(c.edges, 'edges');
  for (const g of groups.rows) {
    string(g.label, 'groups.label');
    requireValue(g.layoutOnly === undefined || typeof g.layoutOnly === 'boolean', 'groups.layoutOnly');
    requireValue(g.kind === undefined || nodeKinds.has(g.kind as string), 'groups.kind');
  }
  for (const n of nodes.rows) {
    requireValue(!groups.ids.has(n.id as string), 'node/group id 충돌');
    requireValue(n.group === undefined || groups.ids.has(n.group as string), 'nodes.group');
    const d = object(n.data, 'nodes.data');
    string(d.label, 'nodes.data.label');
    requireValue(d.role === undefined || d.role === 'screen' || d.role === 'logic', 'nodes.data.role');
    optionalString(d.screen, 'nodes.data.screen');
    requireValue(d.role !== 'logic' || d.screen === undefined, 'logic 노드에는 screen을 넣을 수 없습니다');
    requireValue(d.sectioned === undefined || typeof d.sectioned === 'boolean', 'nodes.data.sectioned');
    if (d.sections !== undefined) {
      requireValue(Array.isArray(d.sections), 'nodes.data.sections');
      for (const section of d.sections) {
        const s = object(section, 'nodes.data.sections[]');
        string(s.title, 'sections.title');
        strings(s.lines, 'sections.lines');
      }
    }
    requireValue(nodeKinds.has(d.kind as string), 'nodes.data.kind');
    if (d.sub !== undefined && typeof d.sub !== 'string') strings(d.sub, 'nodes.data.sub');
    for (const key of ['timing','doc']) optionalString(d[key], `nodes.data.${key}`);
    if (d.entity !== undefined) {
      const e = object(d.entity, 'entity');
      string(e.domain, 'entity.domain');
      requireValue(typeof e.external === 'boolean' && Number.isInteger(e.fieldCount) && (e.fieldCount as number) >= 0, 'entity');
      requireValue(Array.isArray(e.fields), 'entity.fields');
      for (const field of e.fields) {
        const f = object(field, 'entity.field');
        string(f.name, 'entity.field.name'); string(f.type, 'entity.field.type');
        requireValue(typeof f.optional === 'boolean', 'entity.field.optional'); strings(f.keys, 'entity.field.keys');
      }
    }
  }
  for (const e of edges.rows) {
    requireValue(nodes.ids.has(e.source as string) && nodes.ids.has(e.target as string), 'edges.source/target');
    requireValue(edgeKinds.has(e.kind as string), 'edges.kind');
    requireValue(e.tone === undefined || nodeKinds.has(e.tone as string), 'edges.tone');
    optionalString(e.label, 'edges.label');
  }
  if (c.layout !== undefined) {
    requireValue(c.erdDomain === undefined && c.content === undefined, '일반 플로우만 layout을 저장할 수 있습니다');
    const layout = object(c.layout, 'layout');
    const positions = object(layout.nodes, 'layout.nodes');
    const routes = object(layout.edges, 'layout.edges');
    const point = (v: unknown) => {
      const p = object(v, 'layout.point');
      requireValue(['x','y'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]) && Math.abs(p[k] as number) <= 1000000), 'layout.point.x/y');
    };
    for (const [id, p] of Object.entries(positions)) {
      requireValue(nodes.ids.has(id), 'layout.nodes: 존재하지 않는 id'); point(p);
    }
    for (const [id, value] of Object.entries(routes)) {
      requireValue(edges.ids.has(id), 'layout.edges: 존재하지 않는 id');
      const route = object(value, 'layout.edges.route');
      for (const key of ['sourcePort','targetPort']) requireValue(route[key] === undefined || ['left','right','top','bottom'].includes(route[key] as string), 'layout.port');
      if (route.waypoints !== undefined) {
        requireValue(Array.isArray(route.waypoints) && route.waypoints.length <= 100, 'layout.waypoints');
        route.waypoints.forEach(point);
      }
    }
  }
  return c as FlowChart;
}
