import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.ts';
import { todayInSeoul } from '../format/date-time.ts';
import { PERSONAL_ISSUES_SLUG } from '../today-board.ts';
import { parseRecruitmentDocument, RecruitmentError, recruitmentKey, type RecruitmentDocument, type RecruitmentSummary } from '../recruitment.ts';
import { applicationInputSchema, applicationKey, applicationStatuses, applicationTaskSchema, parseApplication, requestIdSchema,
  type ApplicationDetail, type ApplicationInput, type ApplicationRecord, type ApplicationSummary, type ApplicationTask, type ApplicationHistoryEntry } from '../recruitment-applications.ts';
import type { JobDetail } from '../recruitment-jobs.ts';
import { requireCareerOwner } from './career-store.ts';
import { careerTaskKey } from './recruitment-task-privacy.ts';

type DB = Prisma.TransactionClient;
type TaskRow = Prisma.IssueGetPayload<{ include: { schedule: true } }>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflict = () => new RecruitmentError('다른 화면에서 내용이 변경되었습니다. 작성 내용은 유지하고 최신 버전을 확인해 주세요.', 409);
const historyKey = (id: string, revision: number) => `recruitment:application-history:${id}:${revision}`;

async function owner(id: string, db: DB = prisma) {
  try { await requireCareerOwner(id, db); }
  catch { throw new RecruitmentError('현재 소유자 인증을 확인해 주세요.', 403); }
}
function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RecruitmentError('수정 버전을 확인해 주세요.');
}
function taskSummary(row: TaskRow): ApplicationTask {
  return { id: row.id, title: row.title, done: row.done, placement: row.placement,
    startDate: row.schedule?.startDate ?? null, endDate: row.schedule?.endDate ?? null,
    version: digest([row.id, row.projectSlug, row.title, row.done, row.placement, row.todayDate, row.schedule?.revision ?? 0, row.schedule?.startDate ?? null, row.schedule?.endDate ?? null]) };
}
async function current(db: DB, id: string, expectedRevision?: number): Promise<ApplicationRecord | null> {
  const row = await db.appSetting.findUnique({ where: { key: applicationKey(id) } });
  const value = row?.value as unknown as ApplicationRecord | undefined;
  if (expectedRevision !== undefined) {
    revision(expectedRevision);
    if ((value?.revision ?? 0) !== expectedRevision) throw conflict();
  }
  return value ?? null;
}
async function detail(db: DB, application: ApplicationRecord): Promise<ApplicationDetail> {
  const ids = [...application.experienceIds, ...application.coverLetterIds, ...application.portfolioIds];
  const [jobRow, docRows, taskRows] = await Promise.all([
    application.jobId ? db.appSetting.findUnique({ where: { key: `recruitment:job:${application.jobId}` } }) : null,
    db.$queryRaw<{ value: RecruitmentSummary }[]>`SELECT value - 'sections' - 'sourceUrls' AS value FROM app_setting WHERE key IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids.map(recruitmentKey))}::jsonb))`,
    db.issue.findMany({ where: { id: { in: application.taskIds }, projectSlug: PERSONAL_ISSUES_SLUG }, include: { schedule: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
  ]);
  const documents = docRows.map(row => row.value);
  const foundDocuments = new Set(documents.map(doc => doc.id));
  const foundTasks = new Set(taskRows.map(task => task.id));
  const missingLinks = [...ids.filter(id => !foundDocuments.has(id)), ...application.taskIds.filter(id => !foundTasks.has(id))];
  if (application.jobId && !jobRow) missingLinks.unshift(application.jobId);
  const job = jobRow?.value as unknown as JobDetail | undefined;
  // 수집 시각 이후에 마감된 공고도 내 지원 상태와 별도로 표시한다.
  const normalizedJob = job && { ...job, status: job.deadline && Number.isFinite(Date.parse(job.deadline)) && Date.parse(job.deadline) < Date.now() ? 'CLOSED' as const : job.status };
  return { application, job: normalizedJob ?? null, documents, tasks: taskRows.map(taskSummary), missingLinks };
}
async function validateLinks(db: DB, id: string, value: ApplicationInput) {
  const links: [string, string][] = [
    ...value.experienceIds.map(id => [id, 'EXPERIENCE'] as [string, string]),
    ...value.coverLetterIds.map(id => [id, 'COVER_LETTER'] as [string, string]),
    ...value.portfolioIds.map(id => [id, 'PORTFOLIO'] as [string, string]),
  ];
  const keys = [...links.map(([id]) => recruitmentKey(id)), ...(value.jobId ? [`recruitment:job:${value.jobId}`] : [])];
  const rows = await db.$queryRaw<{ key: string; value: Prisma.JsonValue }[]>`SELECT key, value FROM app_setting WHERE key IN (SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb)) ORDER BY key FOR SHARE`;
  const byKey = new Map(rows.map(row => [row.key, row.value as Record<string, unknown>]));
  for (const [docId, kind] of links) if (byKey.get(recruitmentKey(docId))?.kind !== kind) throw new RecruitmentError('연결할 자료가 없거나 종류가 다릅니다. 자료를 다시 선택해 주세요.');
  if (value.jobId && !byKey.has(`recruitment:job:${value.jobId}`)) throw new RecruitmentError('연결할 공고를 찾을 수 없습니다.');
  await db.$queryRaw`SELECT id FROM issue WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(value.taskIds)}::jsonb)) ORDER BY id FOR UPDATE`;
  const tasks = await db.issue.findMany({ where: { id: { in: value.taskIds } }, select: { id: true, projectSlug: true } });
  if (tasks.length !== value.taskIds.length || tasks.some(task => task.projectSlug !== PERSONAL_ISSUES_SLUG)) throw new RecruitmentError('지원 건에는 개인 할 일만 연결할 수 있습니다.');
  for (const taskId of value.taskIds) {
    const marker = await db.appSetting.findUnique({ where: { key: careerTaskKey(taskId) } });
    if (marker && (marker.value as { applicationId?: string }).applicationId !== id) throw new RecruitmentError('다른 지원 건의 할 일입니다.', 409);
    if (!marker) await db.appSetting.create({ data: { key: careerTaskKey(taskId), value: { applicationId: id } } });
  }
}
async function persist(db: DB, id: string, input: ApplicationInput, previous: ApplicationRecord | null, action: string) {
  input = parseApplication(applicationInputSchema, input);
  await validateLinks(db, id, input);
  const now = new Date().toISOString();
  const value: ApplicationRecord = { ...input, id, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
  if (previous) {
    const changed = await db.appSetting.updateMany({ where: { key: applicationKey(id), value: { equals: json(previous) } }, data: { value: json(value) } });
    if (changed.count !== 1) throw conflict();
  } else await db.appSetting.create({ data: { key: applicationKey(id), value: json(value) } });
  await db.appSetting.create({ data: { key: historyKey(id, value.revision), value: json({ application: value, action }) } });
  return detail(db, value);
}
async function mutate(ownerId: string, id: string, requestId: string, payload: unknown, action: (db: DB) => Promise<ApplicationDetail>): Promise<ApplicationDetail> {
  applicationKey(id); parseApplication(requestIdSchema, requestId);
  const requestHash = digest([id, payload]);
  const key = `recruitment:application-request:${digest([ownerId, requestId])}`;
  try {
    return await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM access_user WHERE id = ${ownerId} FOR UPDATE`;
      await owner(ownerId, db);
      const existing = await db.appSetting.findUnique({ where: { key } });
      if (existing) {
        const prior = existing.value as unknown as { requestHash: string; result: ApplicationDetail };
        if (prior.requestHash !== requestHash) throw new RecruitmentError('같은 요청 ID로 다른 내용을 저장할 수 없습니다.', 409);
        return prior.result;
      }
      // 보드의 프로젝트 일괄 이동과 연결 분류를 같은 순서로 보호한다.
      // 행 잠금 전에 잡아, 이동이 비공개 표시 생성 직전 상태를 보고 통과하지 않게 한다.
      await db.$executeRaw`LOCK TABLE issue IN ROW EXCLUSIVE MODE`;
      const result = await action(db);
      await db.appSetting.create({ data: { key, value: json({ requestHash, result }) } });
      return result;
    }, { timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034', 'P2025'].includes(error.code)) throw conflict();
    throw error;
  }
}
export async function listApplications(ownerId: string, query: { query?: string; status?: string } = {}): Promise<ApplicationSummary[]> {
  await owner(ownerId);
  const search = (query.query ?? '').trim(), status = query.status ?? '';
  if (search.length > 200 || status && !Object.hasOwn(applicationStatuses, status)) throw new RecruitmentError('검색 조건을 확인해 주세요.');
  const rows = await prisma.$queryRaw<{ value: ApplicationSummary }[]>`
    SELECT (value - 'notes' - 'experienceIds' - 'coverLetterIds' - 'portfolioIds' - 'taskIds') || jsonb_build_object(
      'experienceCount', jsonb_array_length(value->'experienceIds'), 'coverLetterCount', jsonb_array_length(value->'coverLetterIds'),
      'portfolioCount', jsonb_array_length(value->'portfolioIds'), 'taskCount', jsonb_array_length(value->'taskIds')) AS value
    FROM app_setting WHERE key LIKE 'recruitment:application:%'
      AND (${status} = '' OR value->>'status' = ${status})
      AND (${search} = '' OR strpos(lower(concat_ws(' ', value->>'company', value->>'role', value->>'nextAction')), lower(${search})) > 0)
    ORDER BY (value->>'deadlineAt')::timestamptz NULLS LAST, value->>'updatedAt' DESC, key`;
  return rows.map(row => row.value);
}
export async function getApplication(ownerId: string, id: string): Promise<ApplicationDetail> {
  await owner(ownerId);
  const value = await current(prisma, id);
  if (!value) throw new RecruitmentError('지원 건을 찾을 수 없습니다.', 404);
  return detail(prisma, value);
}
export async function saveApplication(ownerId: string, id: string, input: unknown, expectedRevision: number, requestId: string) {
  const value = parseApplication(applicationInputSchema, input); revision(expectedRevision);
  return mutate(ownerId, id, requestId, ['save', value, expectedRevision], async db => persist(db, id, value, await current(db, id, expectedRevision), 'SAVE'));
}
export async function listApplicationHistory(ownerId: string, id: string): Promise<ApplicationHistoryEntry[]> {
  await owner(ownerId); applicationKey(id);
  if (!await current(prisma, id)) throw new RecruitmentError('지원 건을 찾을 수 없습니다.', 404);
  const prefix = `recruitment:application-history:${id}:`;
  const rows = await prisma.$queryRaw<{ revision: number; updatedAt: string; action: string }[]>`SELECT (value->'application'->>'revision')::int AS revision, value->'application'->>'updatedAt' AS "updatedAt", value->>'action' AS action FROM app_setting WHERE starts_with(key, ${prefix}) ORDER BY (value->'application'->>'revision')::int DESC`;
  return rows;
}
export async function restoreApplication(ownerId: string, id: string, targetRevision: number, expectedRevision: number, requestId: string) {
  revision(targetRevision); revision(expectedRevision);
  return mutate(ownerId, id, requestId, ['restore', targetRevision, expectedRevision], async db => {
    const previous = await current(db, id, expectedRevision);
    if (!previous) throw new RecruitmentError('지원 건을 찾을 수 없습니다.', 404);
    const row = await db.appSetting.findUnique({ where: { key: historyKey(id, targetRevision) } });
    if (!row) throw new RecruitmentError('복원할 버전을 찾을 수 없습니다.', 404);
    const { id: _id, revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = (row.value as unknown as { application: ApplicationRecord }).application;
    return persist(db, id, parseApplication(applicationInputSchema, input), previous, `RESTORE:${targetRevision}`);
  });
}
export async function listApplicationTasks(ownerId: string, applicationId?: string): Promise<ApplicationTask[]> {
  await owner(ownerId);
  if (applicationId !== undefined) applicationKey(applicationId);
  const rows = await prisma.issue.findMany({ where: { projectSlug: PERSONAL_ISSUES_SLUG }, include: { schedule: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  const markers = await prisma.appSetting.findMany({ where: { key: { in: rows.map(row => careerTaskKey(row.id)) } }, select: { key: true, value: true } });
  const assignments = new Map(markers.map(row => [row.key, (row.value as { applicationId: string }).applicationId]));
  return rows.filter(row => !assignments.has(careerTaskKey(row.id)) || assignments.get(careerTaskKey(row.id)) === applicationId).map(taskSummary);
}
export async function saveApplicationTask(ownerId: string, id: string, input: unknown, expectedRevision: number, requestId: string) {
  const task = parseApplication(applicationTaskSchema, input); revision(expectedRevision);
  return mutate(ownerId, id, requestId, ['task', task, expectedRevision], async db => {
    const application = await current(db, id, expectedRevision);
    if (!application) throw new RecruitmentError('지원 건을 찾을 수 없습니다.', 404);
    await db.$queryRaw`SELECT id FROM issue WHERE id = ${task.id} FOR UPDATE`;
    const existing = await db.issue.findUnique({ where: { id: task.id }, include: { schedule: true } });
    if (existing && existing.projectSlug !== PERSONAL_ISSUES_SLUG) throw new RecruitmentError('개인 할 일만 수정할 수 있습니다.', 403);
    if (existing ? task.expectedVersion !== taskSummary(existing).version : task.expectedVersion !== null) throw conflict();
    const marker = await db.appSetting.findUnique({ where: { key: careerTaskKey(task.id) } });
    if (marker && (marker.value as { applicationId?: string }).applicationId !== id) throw new RecruitmentError('다른 지원 건의 할 일입니다.', 409);
    const now = new Date(), today = todayInSeoul(now);
    const placement = task.done && task.placement === 'pool' ? 'archive' : task.placement;
    const data = { title: task.title, done: task.done, placement, todayDate: placement === 'today' ? today : null };
    if (existing) await db.issue.update({ where: { id: task.id }, data });
    else {
      const last = await db.issue.findFirst({ orderBy: { position: 'desc' }, select: { position: true } });
      await db.issue.create({ data: { id: task.id, projectSlug: PERSONAL_ISSUES_SLUG, ...data, createdAt: now, position: (last?.position ?? -1) + 1 } });
    }
    if ((existing?.schedule?.startDate ?? null) !== task.startDate || (existing?.schedule?.endDate ?? null) !== task.endDate) {
      await db.issueSchedule.upsert({ where: { issueId: task.id }, create: { issueId: task.id, startDate: task.startDate, endDate: task.endDate }, update: { startDate: task.startDate, endDate: task.endDate, revision: { increment: 1 } } });
    }
    if (task.done && !existing?.done) await db.completion.create({ data: { id: `career-done-${randomUUID()}`, issueId: task.id, projectSlug: PERSONAL_ISSUES_SLUG, title: task.title, completedOn: today, completedAt: now } });
    if (!task.done && existing?.done) await db.completion.deleteMany({ where: { issueId: task.id, completedOn: today } });
    const { id: _id, revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...value } = application;
    return persist(db, id, { ...value, taskIds: [...new Set([...value.taskIds, task.id])] }, application, 'TASK_SAVE');
  });
}
const draftRequestSchema = z.strictObject({ documentId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), document: z.unknown(), expectedDocumentRevision: z.number().int().nonnegative(), expectedRevision: z.number().int().nonnegative(), requestId: requestIdSchema });
export async function saveApplicationDraft(ownerId: string, id: string, input: { documentId: string; document: unknown; expectedDocumentRevision: number; expectedRevision: number; requestId: string }) {
  const request = parseApplication(draftRequestSchema, input), doc = parseRecruitmentDocument(request.document);
  if (doc.kind !== 'COVER_LETTER') throw new RecruitmentError('자기소개서 초안만 저장할 수 있습니다.');
  return mutate(ownerId, id, request.requestId, ['draft', { ...request, document: doc }], async db => {
    const application = await current(db, id, request.expectedRevision);
    if (!application) throw new RecruitmentError('지원 건을 찾을 수 없습니다.', 404);
    const key = recruitmentKey(request.documentId);
    await db.$queryRaw`SELECT key FROM app_setting WHERE key = ${key} FOR UPDATE`;
    const row = await db.appSetting.findUnique({ where: { key } });
    const previous = row?.value as unknown as RecruitmentDocument | undefined;
    if ((previous?.revision ?? 0) !== request.expectedDocumentRevision) throw conflict();
    if (previous && previous.kind !== 'COVER_LETTER') throw new RecruitmentError('다른 종류의 문서를 덮어쓸 수 없습니다.');
    if (previous && !application.coverLetterIds.includes(request.documentId)) throw new RecruitmentError('이 지원 건에 연결된 초안만 수정할 수 있습니다.', 409);
    const saved = { ...doc, id: request.documentId, revision: request.expectedDocumentRevision + 1, updatedAt: new Date().toISOString() };
    if (previous) {
      const result = await db.appSetting.updateMany({ where: { key, value: { equals: json(previous) } }, data: { value: json(saved) } });
      if (result.count !== 1) throw conflict();
      await db.appSetting.upsert({ where: { key: `recruitment:draft-history:${request.documentId}:${previous.revision}` }, create: { key: `recruitment:draft-history:${request.documentId}:${previous.revision}`, value: json(previous) }, update: {} });
    } else await db.appSetting.create({ data: { key, value: json(saved) } });
    await db.appSetting.create({ data: { key: `recruitment:draft-history:${request.documentId}:${saved.revision}`, value: json(saved) } });
    const { id: _id, revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...value } = application;
    return persist(db, id, { ...value, coverLetterIds: [...new Set([...value.coverLetterIds, saved.id])] }, application, 'DRAFT_SAVE');
  });
}
