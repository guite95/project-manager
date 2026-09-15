import type { FlowChart } from '../components/flow/types.ts';
import type { MeetingContent } from './meetings.ts';
import { parseFlowChart } from './flows/document.ts';

export type MeetingOutcomes = Pick<MeetingContent, 'decisions' | 'actionItems'>;

/** 편집 가능한 두 필드만 교체하고 나머지 문서와 전사본은 보존한다. */
export function editMeetingOutcomes(chart: FlowChart, changes: MeetingOutcomes): FlowChart {
  if (chart.content?.kind !== 'meeting') throw new Error('회의록이 아닙니다.');
  if (!Array.isArray(changes.decisions) || changes.decisions.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error('결정 사항을 입력하거나 빈 항목을 삭제해 주세요.');
  }
  if (!Array.isArray(changes.actionItems) || changes.actionItems.some(item => !item || typeof item.task !== 'string' || !item.task.trim())) {
    throw new Error('태스크 내용을 입력하거나 빈 항목을 삭제해 주세요.');
  }
  return parseFlowChart({ ...chart, content: { ...chart.content, decisions: changes.decisions, actionItems: changes.actionItems } });
}
