import { z } from 'zod';
import { RecruitmentError, type RecruitmentSummary } from './recruitment.ts';
import type { JobDetail } from './recruitment-jobs.ts';

export const applicationStatuses = { REVIEWING: '검토 중', WRITING: '작성 중', SUBMITTED: '제출 완료', INTERVIEW: '면접', OFFER: '합격', REJECTED: '불합격', WITHDRAWN: '지원 철회', EXCLUDED: '제외' } as const;
export const applicationPriorities = { HIGH: '높음', NORMAL: '보통', LOW: '낮음' } as const;
export const applicationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/);
const ids = z.array(applicationIdSchema).max(100).refine(values => new Set(values).size === values.length, '중복 연결을 제거해 주세요.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, '날짜를 확인해 주세요.');
const deadline = z.string().datetime({ offset: true }).nullable();
export const applicationInputSchema = z.strictObject({
  company: z.string().trim().min(1).max(200), role: z.string().trim().min(1).max(200),
  jobId: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  status: z.enum(['REVIEWING','WRITING','SUBMITTED','INTERVIEW','OFFER','REJECTED','WITHDRAWN','EXCLUDED']),
  priority: z.enum(['HIGH','NORMAL','LOW']), deadlineAt: deadline,
  nextAction: z.string().max(1000), exclusionReason: z.string().max(2000), notes: z.string().max(10000),
  experienceIds: ids, coverLetterIds: ids, portfolioIds: ids, taskIds: ids,
}).refine(value => value.status !== 'EXCLUDED' || Boolean(value.exclusionReason.trim()), { message: '제외 사유를 입력해 주세요.', path: ['exclusionReason'] });
export type ApplicationInput = z.infer<typeof applicationInputSchema>;
export type ApplicationRecord = ApplicationInput & { id: string; revision: number; createdAt: string; updatedAt: string };
export type ApplicationSummary = Omit<ApplicationRecord, 'notes'|'experienceIds'|'coverLetterIds'|'portfolioIds'|'taskIds'> & { experienceCount: number; coverLetterCount: number; portfolioCount: number; taskCount: number };
export type ApplicationTask = { id: string; title: string; done: boolean; placement: string; startDate: string|null; endDate: string|null; version: string };
export type ApplicationDetail = { application: ApplicationRecord; job: JobDetail|null; documents: RecruitmentSummary[]; tasks: ApplicationTask[]; missingLinks: string[] };
export type ApplicationHistoryEntry = { revision: number; updatedAt: string; action: string };
export const applicationSaveSchema = z.strictObject({ application: applicationInputSchema, expectedRevision: z.number().int().nonnegative(), requestId: requestIdSchema });
export const applicationTaskSchema = z.strictObject({
  id: applicationIdSchema, title: z.string().trim().min(1).max(500), done: z.boolean(),
  placement: z.enum(['pool','today']), startDate: day.nullable(), endDate: day.nullable(), expectedVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).refine(value => (value.startDate === null && value.endDate === null) || (value.startDate !== null && value.endDate !== null && value.startDate <= value.endDate), { message: '시작일과 마감일을 함께 입력하고 순서를 확인해 주세요.' });
export type ApplicationTaskInput = z.infer<typeof applicationTaskSchema>;
export function parseApplication<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RecruitmentError(result.error.issues[0]?.message || '입력값을 확인해 주세요.');
  return result.data;
}
export function applicationKey(id: string) { return `recruitment:application:${parseApplication(applicationIdSchema, id)}`; }
export function applicationSummary(value: ApplicationRecord): ApplicationSummary {
  const { notes: _notes, experienceIds, coverLetterIds, portfolioIds, taskIds, ...summary } = value;
  return { ...summary, experienceCount: experienceIds.length, coverLetterCount: coverLetterIds.length, portfolioCount: portfolioIds.length, taskCount: taskIds.length };
}
export function emptyApplication(): ApplicationInput {
  return { company: '', role: '', jobId: null, status: 'REVIEWING', priority: 'NORMAL', deadlineAt: null, nextAction: '', exclusionReason: '', notes: '', experienceIds: [], coverLetterIds: [], portfolioIds: [], taskIds: [] };
}
