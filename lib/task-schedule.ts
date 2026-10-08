import type { Issue } from './today-board.ts';

export type IssueSchedule = { startDate: string | null; endDate: string | null; revision: number };
export type ScheduleTask = Issue & {
  done: boolean;
  placement: string;
  schedule: IssueSchedule;
};
export type GanttScale = 'week' | 'month';
export type GanttWindow = { start: string; end: string; days: string[] };
export class TaskScheduleError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function validScheduleDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseIssueSchedule(value: unknown): IssueSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskScheduleError('일정을 확인해 주세요.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['startDate', 'endDate', 'revision'].includes(key)) ||
      !Number.isSafeInteger(input.revision) || (input.revision as number) < 0) {
    throw new TaskScheduleError('일정 버전을 확인해 주세요.');
  }
  const { startDate, endDate } = input;
  if (startDate === null && endDate === null) return { startDate, endDate, revision: input.revision as number };
  if (!validScheduleDate(startDate) || !validScheduleDate(endDate)) throw new TaskScheduleError('시작일과 마감일을 모두 지정해 주세요.');
  if (endDate < startDate) throw new TaskScheduleError('마감일은 시작일보다 빠를 수 없습니다.');
  return { startDate, endDate, revision: input.revision as number };
}

const dateAt = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateString = (date: Date) => date.toISOString().slice(0, 10);
export function addScheduleDays(date: string, days: number): string {
  const value = dateAt(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateString(value);
}

export function scheduleWindow(anchor: string, scale: GanttScale): GanttWindow {
  const startDate = dateAt(anchor);
  if (scale === 'week') startDate.setUTCDate(startDate.getUTCDate() - (startDate.getUTCDay() + 6) % 7);
  else startDate.setUTCDate(1);
  const endDate = new Date(startDate);
  if (scale === 'week') endDate.setUTCDate(endDate.getUTCDate() + 6);
  else { endDate.setUTCMonth(endDate.getUTCMonth() + 1); endDate.setUTCDate(0); }
  const start = dateString(startDate), end = dateString(endDate);
  const count = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return { start, end, days: Array.from({ length: count }, (_, index) => addScheduleDays(start, index)) };
}

export function moveScheduleWindow(anchor: string, scale: GanttScale, direction: -1 | 1): string {
  if (scale === 'week') return addScheduleDays(anchor, direction * 7);
  const value = dateAt(anchor);
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + direction);
  return dateString(value);
}

/** 양 끝 날짜를 포함한다. 월·연 경계와 화면 밖으로 이어지는 기간도 같은 방식으로 자른다. */
export function ganttBar(schedule: Pick<IssueSchedule, 'startDate' | 'endDate'>, window: GanttWindow) {
  if (!schedule.startDate || !schedule.endDate || schedule.endDate < window.start || schedule.startDate > window.end) return null;
  const first = schedule.startDate < window.start ? window.start : schedule.startDate;
  const last = schedule.endDate > window.end ? window.end : schedule.endDate;
  const offset = Math.round((dateAt(first).getTime() - dateAt(window.start).getTime()) / 86400000);
  const length = Math.round((dateAt(last).getTime() - dateAt(first).getTime()) / 86400000) + 1;
  return { left: offset / window.days.length * 100, width: length / window.days.length * 100 };
}
