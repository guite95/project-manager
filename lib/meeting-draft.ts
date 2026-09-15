import { createHash } from 'node:crypto';
import type { FlowChart } from '../components/flow/types.ts';
import type { MeetingContent } from './meetings.ts';
import { parseFlowChart } from './flows/document.ts';

export type MeetingDraft = {
  version: 1;
  projectSlug: string;
  transcriptSha256: string;
  chart: FlowChart & { content: MeetingContent & { transcript: string } };
};
export class MeetingDraftError extends Error {}
export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const slug = (value: unknown) => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(value);

export function parseMeetingDraft(value: unknown): MeetingDraft {
  if (!object(value) || value.version !== 1 || !slug(value.projectSlug)) throw new MeetingDraftError('초안 버전 또는 프로젝트 식별자가 올바르지 않습니다.');
  let chart: FlowChart;
  try { chart = parseFlowChart(value.chart); }
  catch { throw new MeetingDraftError('회의록 JSON 형식이 올바르지 않습니다.'); }
  if (chart.content?.kind !== 'meeting' || typeof chart.content.transcript !== 'string' || !chart.content.transcript.trim() || chart.erdDomain || chart.nodes.length || chart.edges.length) {
    throw new MeetingDraftError('전사본이 포함된 회의록 문서가 필요합니다.');
  }
  if (sha256(chart.content.transcript) !== value.transcriptSha256) throw new MeetingDraftError('원문 해시가 다릅니다. 입력 전사본에서 초안을 다시 조립하세요.');
  return value as MeetingDraft;
}

export function prepareMeetingDraft(input: { projectSlug: string; slug: string; title: string; date: string; transcript: string; notes: unknown }): MeetingDraft {
  const keys = ['participants', 'summary', 'discussions', 'decisions', 'actionItems'];
  const notes = input.notes;
  if (!object(notes) || Object.keys(notes).some(key => !keys.includes(key)) || keys.some(key => !(key in notes))) {
    throw new MeetingDraftError('notes에는 participants, summary, discussions, decisions, actionItems만 포함하세요.');
  }
  if (typeof input.transcript !== 'string') throw new MeetingDraftError('UTF-8 전사본이 필요합니다.');
  return parseMeetingDraft({
    version: 1, projectSlug: input.projectSlug, transcriptSha256: sha256(input.transcript),
    chart: { slug: input.slug, title: input.title, nodes: [], edges: [],
      content: { ...notes, kind: 'meeting', date: input.date, transcript: input.transcript } },
  });
}
