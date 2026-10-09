import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { spawnSync } from 'node:child_process';
import { prisma, resetDatabase } from './test-db.mjs';
import { parseTaskOptions, readProjectTasks, parseTodayOptions, readTodayTasks } from './project-tasks.ts';

const clearProjects = () => prisma.flowProject.deleteMany({ where: { slug: { in: ['alpha', 'beta', 'empty'] } } });
beforeEach(async () => { await resetDatabase(); await clearProjects(); });
after(async () => { await resetDatabase(); await clearProjects(); await prisma.$disconnect(); });

test('프로젝트별 조회는 상태와 위치로 필터하며 지난 날짜의 항목도 변경하지 않는다', async () => {
  await prisma.flowProject.createMany({ data: [
    { slug: 'alpha', title: 'Alpha', position: 0, showInTasks: false },
    { slug: 'beta', title: 'Beta', position: 1 },
  ] });
  await prisma.issue.createMany({ data: [
    { id: 'pool', projectSlug: 'alpha', title: '대기', placement: 'pool', position: 0 },
    { id: 'today', projectSlug: 'alpha', title: '지난 날짜 미완료', placement: 'today', todayDate: '2020-01-01', position: 0 },
    { id: 'done', projectSlug: 'alpha', title: '완료', placement: 'today', todayDate: '2020-01-01', position: 1, done: true },
    { id: 'other', projectSlug: 'beta', title: '다른 프로젝트', placement: 'pool', position: 2 },
  ].map(row => ({ createdAt: new Date('2020-01-01'), ...row })) });
  const before = await prisma.issue.findMany({ orderBy: { id: 'asc' } });
  const read = args => readProjectTasks(prisma, parseTaskOptions('alpha', args));
  const result = await read([]);
  assert.deepEqual(result.tasks.map(row => row.id), ['pool', 'today']);
  assert.equal(result.project.showInTasks, false);
  assert.equal(result.count, 2);
  assert.deepEqual((await read(['--status', 'done'])).tasks.map(row => row.id), ['done']);
  assert.deepEqual((await read(['--placement', 'pool'])).tasks.map(row => row.id), ['pool']);
  assert.deepEqual((await read(['--status', 'all', '--placement', 'today'])).tasks.map(row => row.id), ['today', 'done']);
  assert.equal((await read(['--status', 'all'])).count, 3);
  assert.deepEqual(await prisma.issue.findMany({ orderBy: { id: 'asc' } }), before);
  assert.equal(await prisma.completion.count(), 0);
  await assert.rejects(readProjectTasks(prisma, parseTaskOptions('missing', [])), /등록된 프로젝트/);
});

test('할 일이 없는 프로젝트는 빈 JSON 목록을 반환한다', async () => {
  await prisma.flowProject.create({ data: { slug: 'empty', title: 'Empty', position: 0 } });
  const result = await readProjectTasks(prisma, parseTaskOptions('empty', []));
  assert.equal(result.count, 0);
  assert.deepEqual(result.tasks, []);
  const cli = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/pm-flow.mjs', 'tasks', 'empty'], {
    encoding: 'utf8', env: { ...process.env, PM_FLOW_CHILD: '1', SHARED_DATABASE: '1' },
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), result);
});

test('잘못된 CLI 인자는 SSH 연결 전에 실패한다', () => {
  for (const args of [[], ['alpha', '--status', 'invalid'], ['alpha', '--placement'], ['alpha', '--status', 'open', '--status', 'all'], ['alpha', '--unknown', 'x'], ['alpha/beta']]) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/pm-flow.mjs', 'tasks', ...args], {
      encoding: 'utf8', env: { ...process.env, PM_FLOW_CHILD: '0', PM_FLOW_SSH_CONFIG: '/nonexistent/task-test-config' },
    });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /SSH|설정 파일/);
  }
});

test('프로젝트 CLI 오늘 목록은 개인 업무를 제외하고 한국 날짜 경계와 이월 규칙을 지킨다', async () => {
  const now = new Date('2026-09-27T15:00:00Z');
  await prisma.issue.createMany({ data: [
    { id: 'today-open', projectSlug: 'alpha', todayDate: '2026-09-28', position: 2 },
    { id: 'today-done', projectSlug: '__personal_issues__', todayDate: '2026-09-28', position: 1, done: true },
    { id: 'past-open', projectSlug: 'alpha', todayDate: '2026-09-27', position: 3 },
    { id: 'past-done', projectSlug: 'alpha', todayDate: '2026-09-27', position: 4, done: true },
    { id: 'no-date', projectSlug: 'unregistered', todayDate: null, position: 5 },
    { id: 'future', projectSlug: 'beta', todayDate: '2026-09-29', position: 6 },
    { id: 'in-pool', projectSlug: 'beta', todayDate: null, position: 0, placement: 'pool' },
  ].map(row => ({ title: row.id, createdAt: now, placement: 'today', ...row })) });
  const before = await prisma.issue.findMany({ orderBy: { id: 'asc' } });
  const read = args => readTodayTasks(prisma, parseTodayOptions(args), now);
  const all = await read([]);
  assert.equal(all.date, '2026-09-28');
  assert.deepEqual(all.tasks.map(row => row.id), ['today-open', 'no-date', 'future']);
  assert.equal(all.count, 3);
  assert.deepEqual((await read(['--status', 'open'])).tasks.map(row => row.id), ['today-open', 'no-date', 'future']);
  assert.deepEqual((await read(['--status', 'done'])).tasks.map(row => row.id), []);
  assert.deepEqual(await prisma.issue.findMany({ orderBy: { id: 'asc' } }), before);
  assert.equal(await prisma.completion.count(), 0);
});

test('today CLI는 프로젝트 없이 빈 목록을 반환하고 잘못된 옵션은 연결 전에 거부한다', () => {
  const run = (args, env) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/pm-flow.mjs', 'today', ...args], {
    encoding: 'utf8', env: { ...process.env, ...env },
  });
  const result = run([], { PM_FLOW_CHILD: '1', SHARED_DATABASE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).tasks, []);
  assert.equal(JSON.parse(result.stdout).filters.status, 'all');
  for (const args of [['alpha'], ['--status'], ['--status', 'bad'], ['--placement', 'today'], ['--status', 'open', '--status', 'done']]) {
    const invalid = run(args, { PM_FLOW_CHILD: '0', PM_FLOW_SSH_CONFIG: '/nonexistent/task-test-config' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /사용법: today/);
  }
});
