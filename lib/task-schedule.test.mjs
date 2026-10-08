import assert from 'node:assert/strict';
import test from 'node:test';
import { ganttBar, moveScheduleWindow, parseIssueSchedule, scheduleWindow, validScheduleDate } from './task-schedule.ts';

test('일정은 실제 날짜·양쪽 날짜·기간 순서·revision을 검증한다', () => {
  const valid = { startDate: '2028-02-29', endDate: '2028-03-02', revision: 0 };
  assert.deepEqual(parseIssueSchedule(valid), valid);
  assert.deepEqual(parseIssueSchedule({ startDate: null, endDate: null, revision: 3 }), { startDate: null, endDate: null, revision: 3 });
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '0000-01-01', '2026-01-01T00:00:00Z', null]) assert.equal(validScheduleDate(date), false);
  for (const input of [null, [], {}, { ...valid, revision: -1 }, { ...valid, revision: 0.5 },
    { ...valid, endDate: '2028-02-28' }, { ...valid, startDate: null }, { ...valid, endDate: null }, { ...valid, done: true }]) {
    assert.throws(() => parseIssueSchedule(input), error => error.status === 400);
  }
});

test('주간은 월요일부터 일요일, 월간은 해당 월의 실제 일수를 사용한다', () => {
  const week = scheduleWindow('2026-01-01', 'week');
  assert.equal(week.start, '2025-12-29');
  assert.equal(week.end, '2026-01-04');
  assert.equal(week.days.length, 7);
  assert.equal(scheduleWindow('2028-02-14', 'month').days.length, 29);
  assert.equal(scheduleWindow('2026-02-14', 'month').end, '2026-02-28');
  assert.equal(moveScheduleWindow('2026-01-31', 'month', 1), '2026-02-01');
  assert.equal(moveScheduleWindow('2026-01-01', 'month', -1), '2025-12-01');
  assert.equal(moveScheduleWindow('2026-12-30', 'week', 1), '2027-01-06');
});

test('간트 막대는 당일 일정과 양 끝을 포함하고 조회 범위에 맞춰 잘라낸다', () => {
  const window = scheduleWindow('2026-10-08', 'week');
  const firstDay = ganttBar({ startDate: window.start, endDate: window.start }, window);
  assert.equal(firstDay.left, 0);
  assert.ok(Math.abs(firstDay.width - 100 / 7) < 1e-10);
  assert.deepEqual(ganttBar({ startDate: '2026-09-01', endDate: '2026-11-01' }, window), { left: 0, width: 100 });
  assert.equal(ganttBar({ startDate: '2026-09-01', endDate: '2026-09-30' }, window), null);
  assert.equal(ganttBar({ startDate: null, endDate: null }, window), null);
  const lastDay = ganttBar({ startDate: '2026-10-11', endDate: '2026-10-20' }, window);
  assert.ok(Math.abs(lastDay.left - 600 / 7) < 1e-10);
  assert.ok(Math.abs(lastDay.width - 100 / 7) < 1e-10);
});
