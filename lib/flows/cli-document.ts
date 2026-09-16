import { FlowDocumentError, parseFlowChart } from './document.ts';
import type { FlowChart } from '../../components/flow/types.ts';

export type FlowEnvelope = { projectSlug: string; categorySlug: string; revision: number; chart: FlowChart };
export function parseFlowEnvelope(value: unknown): FlowEnvelope {
  if (!value || typeof value !== 'object') throw new FlowDocumentError('차트 문서가 필요합니다.');
  const row = value as FlowEnvelope;
  for (const key of ['projectSlug', 'categorySlug'] as const) {
    if (typeof row[key] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(row[key])) throw new FlowDocumentError(`${key}가 올바르지 않습니다.`);
  }
  if (!Number.isSafeInteger(row.revision) || row.revision < 0) throw new FlowDocumentError('revision은 0 이상의 정수여야 합니다.');
  const chart = parseFlowChart(row.chart);
  if (chart.erdDomain !== undefined || chart.content !== undefined) throw new FlowDocumentError('이 CLI는 일반 플로우차트 전용입니다.');
  return { projectSlug: row.projectSlug, categorySlug: row.categorySlug, revision: row.revision, chart };
}

/** 필드별 변경 내용. 배열 순서 변화도 검토할 수 있게 그대로 표시한다. */
export function flowDiff(before: unknown, after: unknown, path = ''): { path: string; before: unknown; after: unknown }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const a = before as Record<string, unknown>, b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => flowDiff(a[key], b[key], `${path}/${key}`));
  }
  return [{ path: path || '/', before: before ?? null, after: after ?? null }];
}
