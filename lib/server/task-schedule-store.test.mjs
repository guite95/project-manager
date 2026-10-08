import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { prisma, resetDatabase } from './test-db.mjs';
import { createIssue, deleteIssue, loadBoard, moveIssue, setIssueDone, setIssueTitle } from './board-store.ts';
import { listScheduleTasks, setIssueSchedule } from './task-schedule-store.ts';

beforeEach(resetDatabase);
after(() => prisma.$disconnect());
const owner = { hiddenProjectSlugs: [] };
const admin = { hiddenProjectSlugs: ['private-project', '__personal_issues__'] };
const now = '2026-10-08T03:00:00.000Z', today = '2026-10-08';
const schedule = { startDate: '2026-10-05', endDate: '2026-10-12', revision: 0 };
const add = (id, projectSlug = 'common', dates) => createIssue({ id, projectSlug, title: `할 일 ${id}`, now, schedule: dates }, owner);
const complete = (id, date = today, done = true, suffix = '') => setIssueDone({ id, done, completionId: `done-${id}${suffix}`, today: date, now }, owner);

test('새 이슈와 일정은 함께 저장하며 기존 이슈 조회는 날짜를 자동 생성하지 않는다', async () => {
  await add('scheduled', 'common', schedule);
  await add('plain');
  const before = await prisma.issue.findMany({ orderBy: { id: 'asc' } });
  const tasks = await listScheduleTasks(owner);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.find(task => task.id === 'scheduled').schedule, { ...schedule, revision: 1 });
  assert.deepEqual(tasks.find(task => task.id === 'plain').schedule, { startDate: null, endDate: null, revision: 0 });
  assert.equal(await prisma.issueSchedule.count(), 1);
  assert.deepEqual(await prisma.issue.findMany({ orderBy: { id: 'asc' } }), before);
  await assert.rejects(() => add('bad', 'common', { ...schedule, endDate: '2026-10-01' }), error => error.status === 400);
  assert.equal(await prisma.issue.count({ where: { id: 'bad' } }), 0);
});

test('동일 revision의 동시 수정은 하나만 저장하고 기간을 지워도 버전은 보존한다', async () => {
  await add('a', 'common', schedule);
  const results = await Promise.allSettled([
    setIssueSchedule('a', { ...schedule, revision: 1, endDate: '2026-10-13' }, owner),
    setIssueSchedule('a', { ...schedule, revision: 1, endDate: '2026-10-14' }, owner),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  assert.deepEqual(await setIssueSchedule('a', { startDate: null, endDate: null, revision: 2 }, owner), { startDate: null, endDate: null, revision: 3 });
  await assert.rejects(() => setIssueSchedule('a', schedule, owner), error => error.status === 409);
  assert.equal(await prisma.issue.count(), 1);
  assert.equal(await prisma.issueSchedule.count(), 1);
});

test('일정이 있는 완료 항목은 날짜 이월 후에도 원본과 완료 이력을 보존한다', async () => {
  for (const id of ['scheduled', 'plain', 'open']) {
    await add(id, 'common', id === 'plain' ? undefined : schedule);
    await moveIssue(id, 'today', '2026-10-07', owner);
    if (id !== 'open') await complete(id, '2026-10-07');
  }
  const before = await prisma.issue.findMany({ orderBy: { id: 'asc' } });
  assert.equal((await listScheduleTasks(owner)).length, 3);
  assert.deepEqual(await prisma.issue.findMany({ orderBy: { id: 'asc' } }), before, '간트 GET은 날짜 이월도 하지 않는다');
  const board = await loadBoard(today, owner);
  assert.deepEqual(board.issues.map(task => task.id), ['open']);
  assert.deepEqual(board.today, []);
  const saved = await prisma.issue.findUnique({ where: { id: 'scheduled' }, include: { schedule: true } });
  assert.equal(saved.placement, 'archive');
  assert.equal(saved.done, true);
  assert.equal(saved.schedule.endDate, schedule.endDate);
  assert.equal(await prisma.issue.findUnique({ where: { id: 'plain' } }), null);
  assert.equal(await prisma.completion.count(), 2);
  assert.equal((await listScheduleTasks(owner)).find(task => task.id === 'scheduled').done, true);
});

test('풀의 일정 완료·반복 요청·완료 취소는 같은 이슈와 완료 이력을 사용한다', async () => {
  await add('a', 'common', schedule);
  await complete('a');
  await complete('a', today, true, '-repeat');
  assert.equal((await prisma.issue.findUnique({ where: { id: 'a' } })).placement, 'archive');
  assert.equal(await prisma.completion.count(), 1);
  assert.equal((await loadBoard(today, owner)).issues.length, 0);
  await complete('a', today, false);
  assert.equal((await loadBoard(today, owner)).issues[0].id, 'a');
  assert.equal(await prisma.completion.count(), 0);
  assert.equal((await listScheduleTasks(owner))[0].schedule.revision, 1);
});

test('제목 변경과 오늘 이동은 일정을 유지하며 이슈 삭제만 연결된 일정을 지운다', async () => {
  await add('a', 'common', schedule);
  await setIssueTitle('a', '바꾼 제목', owner);
  await moveIssue('a', 'today', today, owner);
  await complete('a');
  assert.equal((await listScheduleTasks(owner))[0].title, '바꾼 제목');
  await deleteIssue('a', owner);
  assert.equal(await prisma.issueSchedule.count(), 0);
  assert.equal(await prisma.completion.count(), 1);
});

test('관리자는 개인 일정의 조회와 수정을 할 수 없고 미등록 ID는 404다', async () => {
  await add('company', 'common', schedule);
  await add('private', 'private-project', schedule);
  await add('personal', '__personal_issues__', schedule);
  assert.deepEqual((await listScheduleTasks(admin)).map(task => task.id), ['company']);
  for (const id of ['private', 'personal']) {
    await assert.rejects(() => setIssueSchedule(id, { ...schedule, revision: 1 }, admin), error => error.status === 403);
  }
  assert.equal((await prisma.issueSchedule.findUnique({ where: { issueId: 'private' } })).revision, 1);
  await assert.rejects(() => setIssueSchedule('missing', schedule, owner), error => error.status === 404);
});

test('일정 최초 저장과 날짜 이월이 겹쳐도 성공한 일정의 원본이 지워지지 않는다', async () => {
  await add('a');
  await moveIssue('a', 'today', '2026-10-07', owner);
  await complete('a', '2026-10-07');
  const [saved] = await Promise.allSettled([setIssueSchedule('a', schedule, owner), loadBoard(today, owner)]);
  await loadBoard(today, owner);
  if (saved.status === 'fulfilled') {
    assert.equal((await prisma.issue.findUnique({ where: { id: 'a' } })).placement, 'archive');
    assert.equal(await prisma.issueSchedule.count(), 1);
  } else {
    assert.equal(saved.reason.status, 404);
    assert.equal(await prisma.issue.count(), 0);
    assert.equal(await prisma.issueSchedule.count(), 0);
  }
  assert.equal(await prisma.completion.count(), 1);
});
