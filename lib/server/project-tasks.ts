import type { PrismaClient } from '@prisma/client';
import { todayInSeoul } from '../format/date-time.ts';

export function parseTodayOptions(args: string[]) {
  if (!args.length) return { status: 'all' };
  if (args.length === 2 && args[0] === '--status' && ['open', 'done', 'all'].includes(args[1])) return { status: args[1] };
  throw new Error('사용법: today [--status open|done|all]');
}

/** 보드가 날짜 이월 후 보여줄 오늘 목록을 쓰기 없이 조회한다. */
export async function readTodayTasks(db: Pick<PrismaClient, 'issue'>, input: ReturnType<typeof parseTodayOptions>, now = new Date()) {
  const date = todayInSeoul(now);
  const tasks = await db.issue.findMany({
    where: {
      placement: 'today',
      OR: [{ todayDate: { gte: date } }, { todayDate: null }],
      ...(input.status === 'all' ? {} : { done: input.status === 'done' }),
    },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true, projectSlug: true, title: true, done: true, placement: true, todayDate: true, position: true, createdAt: true },
  });
  return { date, timeZone: 'Asia/Seoul', filters: { status: input.status, placement: 'today' }, count: tasks.length, tasks };
}

export function parseTaskOptions(projectSlug: string, args: string[]) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(projectSlug)) throw new Error('프로젝트 slug가 올바르지 않습니다.');
  const options = { status: 'open', placement: 'all' };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (seen.has(key)) throw new Error('중복 옵션입니다.');
    seen.add(key);
    if (key === '--status' && ['open', 'done', 'all'].includes(value)) options.status = value;
    else if (key === '--placement' && ['pool', 'today', 'all'].includes(value)) options.placement = value;
    else throw new Error('사용법: tasks PROJECT [--status open|done|all] [--placement pool|today|all]');
  }
  return { projectSlug, ...options };
}

/** 개인 SSH CLI 전용 읽기. 보드 rollover나 완료 이력 변경을 수행하지 않는다. */
export async function readProjectTasks(db: Pick<PrismaClient, 'flowProject' | 'issue'>, input: ReturnType<typeof parseTaskOptions>) {
  const project = await db.flowProject.findUnique({
    where: { slug: input.projectSlug },
    select: { slug: true, title: true, scope: true, showInTasks: true },
  });
  if (!project) throw new Error('등록된 프로젝트를 찾을 수 없습니다. pm-flow list로 slug를 확인하세요.');
  const tasks = await db.issue.findMany({
    where: {
      projectSlug: project.slug,
      ...(input.status === 'all' ? {} : { done: input.status === 'done' }),
      ...(input.placement === 'all' ? {} : { placement: input.placement }),
    },
    orderBy: [{ placement: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    select: { id: true, projectSlug: true, title: true, done: true, placement: true, todayDate: true, position: true, createdAt: true },
  });
  return { project, filters: { status: input.status, placement: input.placement }, count: tasks.length, tasks };
}
