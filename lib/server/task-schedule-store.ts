import { prisma } from '../db.ts';
import { parseIssueSchedule, TaskScheduleError, type IssueSchedule, type ScheduleTask } from '../task-schedule.ts';
import { assertTaskProject, taskProjectFilter, type TaskAccess } from './task-access.ts';

/** 간트 조회는 오늘 목록 이월이나 초기 일정 생성을 수행하지 않는다. */
export async function listScheduleTasks(access: TaskAccess): Promise<ScheduleTask[]> {
  const rows = await prisma.issue.findMany({
    where: { projectSlug: taskProjectFilter(access) },
    include: { schedule: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  return rows.map(row => ({
    id: row.id, title: row.title, projectSlug: row.projectSlug, createdAt: row.createdAt.toISOString(),
    done: row.done, placement: row.placement,
    schedule: row.schedule ? { startDate: row.schedule.startDate, endDate: row.schedule.endDate, revision: row.schedule.revision }
      : { startDate: null, endDate: null, revision: 0 },
  }));
}

export async function setIssueSchedule(id: string, input: IssueSchedule, access: TaskAccess): Promise<IssueSchedule> {
  const next = parseIssueSchedule(input);
  return prisma.$transaction(async tx => {
    // 완료·프로젝트 이동·날짜 이월도 이슈 행을 잠그므로 일정이 저장되는 도중 원본이 정리되지 않는다.
    await tx.$queryRaw`SELECT id FROM issue WHERE id = ${id} FOR UPDATE`;
    const issue = await tx.issue.findUnique({ where: { id }, include: { schedule: true } });
    if (!issue) throw new TaskScheduleError('할 일을 찾을 수 없습니다. 목록을 새로고침해 주세요.', 404);
    assertTaskProject(issue.projectSlug, access);
    if ((issue.schedule?.revision ?? 0) !== next.revision) throw new TaskScheduleError('다른 화면에서 일정이 변경되었습니다. 최신 일정을 확인한 뒤 다시 저장해 주세요.', 409);
    const schedule = await tx.issueSchedule.upsert({
      where: { issueId: id },
      create: { issueId: id, startDate: next.startDate, endDate: next.endDate },
      update: { startDate: next.startDate, endDate: next.endDate, revision: { increment: 1 } },
    });
    return { startDate: schedule.startDate, endDate: schedule.endDate, revision: schedule.revision };
  });
}
