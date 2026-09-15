import { createHash } from 'node:crypto';
import { domainOf, erdDomains, makeErdChart, type ErdSnapshot } from '../erd/chart.ts';
import { layoutErd } from '../erd/layout.ts';
import { routeErd } from '../erd/routes.ts';
import { entityHeight } from '../erd/geometry.ts';
import { erdLayoutKey, parseSavedErdLayout, type SavedErdLayout } from '../erd/saved-layout.ts';

/** JSONB 객체의 키 순서와 무관하게 같은 입력을 식별한다. */
export function erdHash(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => [key,canonical(item)])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function erdLayoutViews(snapshot: ErdSnapshot) {
  return [...erdDomains.map(d => ({domain:d.slug,focus:undefined as string|undefined})),
    ...snapshot.models.map(m => ({domain:domainOf(m.name).slug,focus:m.name}))];
}

/** 명시적인 DB 등록 명령에서만 호출한다. 화면의 GET 경로에서는 사용하지 않는다. */
export function generateErdLayouts(snapshot: ErdSnapshot): Map<string, SavedErdLayout> {
  const snapshotHash = erdHash(snapshot);
  const savedAt = new Date().toISOString();
  return new Map(erdLayoutViews(snapshot).map(({domain,focus}) => {
    const chart = makeErdChart(snapshot,domain,focus);
    const layout = layoutErd(chart.nodes.map(n => ({
      id:n.id,width:chart.nodeWidth!,height:entityHeight(n.data.entity!.fields.length),
      domain:n.data.entity!.domain,external:n.data.entity!.external,
    })),chart.edges);
    const value: SavedErdLayout = {version:1,revision:1,snapshotHash,savedAt,layout,routing:routeErd(layout.nodes,chart.edges)};
    return [erdLayoutKey(domain,focus),parseSavedErdLayout(value,chart)];
  }));
}
