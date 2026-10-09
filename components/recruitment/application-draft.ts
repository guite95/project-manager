import type { ApplicationInput } from '../../lib/recruitment-applications.ts';

export type ApplicationDraft = {
  id: string;
  expectedRevision: number;
  application: ApplicationInput;
  deadlineDate: string;
  deadlineTime: string;
  deadlineChanged: boolean;
};

export function draftFromApplication(id: string, application: ApplicationInput, expectedRevision = 0): ApplicationDraft {
  const koreanDate = application.deadlineAt ? new Date(Date.parse(application.deadlineAt) + 9 * 60 * 60 * 1000).toISOString() : '';
  const { company, role, jobId, status, priority, deadlineAt, nextAction, exclusionReason, notes, experienceIds, coverLetterIds, portfolioIds, taskIds } = application;
  return { id, expectedRevision, application: structuredClone({ company, role, jobId, status, priority, deadlineAt, nextAction, exclusionReason, notes, experienceIds, coverLetterIds, portfolioIds, taskIds }), deadlineDate: koreanDate.slice(0, 10), deadlineTime: koreanDate.slice(11, 16), deadlineChanged: false };
}

export function inputFromDraft(draft: ApplicationDraft): ApplicationInput {
  if (Boolean(draft.deadlineDate) !== Boolean(draft.deadlineTime)) throw new Error('마감 날짜와 시간을 함께 입력하거나 모두 비워 주세요. 시간이 확인되지 않았다면 원문의 날짜는 지원 메모에 남겨 주세요.');
  if (!draft.deadlineChanged) return draft.application;
  if (draft.deadlineTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.deadlineTime)) throw new Error('마감 시간은 24시간 기준 HH:mm으로 입력해 주세요.');
  return { ...draft.application, deadlineAt: draft.deadlineDate && draft.deadlineTime ? `${draft.deadlineDate}T${draft.deadlineTime}:00+09:00` : null };
}
