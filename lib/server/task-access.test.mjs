import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { prisma, resetDatabase } from './test-db.mjs';
import * as board from './board-store.ts';
import { listCompletions } from './history-store.ts';
import { listFlowProjectNames } from './flows-store.ts';
import { loadTaskAccess } from './task-access.ts';
import { PERSONAL_ISSUES_SLUG } from '../today-board.ts';

const company = 'task-access-company';
const personal = 'task-access-private';
const owner = { id: 'owner', role: 'OWNER', memberships: [] };
const admin = { id: 'admin', role: 'ADMIN', memberships: [{ projectSlug: personal, role: 'EDITOR' }] };
const now = '2026-09-30T03:00:00.000Z';
const date = '2026-09-30';
let access;
before(async () => {
  await prisma.flowProject.createMany({ data: [
    { slug: company, title: '회사', scope: 'COMPANY', showInTasks: false, position: 999 },
    { slug: personal, title: '개인', scope: 'PERSONAL', personalGroup: 'TOY', position: 999 },
  ] });
  access = await loadTaskAccess(admin);
});
beforeEach(resetDatabase);
after(async () => {
  await resetDatabase();
  await prisma.flowProject.deleteMany({ where: { slug: { in: [company, personal] } } });
  await prisma.$disconnect();
});

async function add(id, projectSlug = company) {
  // 표시가 해제된 회사 프로젝트도 기존 할 일과 이력은 계속 읽는다.
  await prisma.issue.create({ data: { id, projectSlug, title: id, placement: 'pool', position: 7, createdAt: new Date(now) } });
}
const denied = error => error.status === 403;

test('할 일은 소유자와 관리자만 사용하며 개인 멤버십으로 개인 이슈를 열지 않는다', async () => {
  assert.deepEqual(await loadTaskAccess(owner), { hiddenProjectSlugs: [] });
  assert.ok(access.hiddenProjectSlugs.includes(personal));
  assert.ok(access.hiddenProjectSlugs.includes(PERSONAL_ISSUES_SLUG));
  await assert.rejects(() => loadTaskAccess({ ...admin, role: 'MEMBER' }), denied);
});

test('관리자 보드와 프로젝트 이름은 개인 데이터를 제외하고 회사·공통·미분류를 보존한다', async () => {
  for (const [id, slug] of [['company', company], ['private', personal], ['personal', PERSONAL_ISSUES_SLUG], ['common', 'common'], ['orphan', 'removed-company']]) await add(id, slug);
  await add('private-today', personal); await board.moveIssue('private-today', 'today', date);
  await add('company-today'); await board.moveIssue('company-today', 'today', date);
  await board.createCustomProject({ slug: personal, title: '숨김', now });
  await board.createCustomProject({ slug: 'custom', title: '공용', now });
  await board.saveSettings({ projectOrder: [personal, company, PERSONAL_ISSUES_SLUG, 'custom'], collapsedProjects: [personal, company] });
  const visible = await board.loadBoard(date, access);
  assert.deepEqual(visible.issues.map(row => row.id), ['company', 'common', 'orphan']);
  assert.deepEqual(visible.today.map(row => row.id), ['company-today']);
  assert.deepEqual(visible.customProjects.map(row => row.slug), ['custom']);
  assert.deepEqual(visible.projectOrder, [company, 'custom']);
  assert.deepEqual(visible.collapsedProjects, [company]);
  const names = await listFlowProjectNames(access);
  assert.ok(!names.some(row => row.slug === personal));
  assert.equal(names.find(row => row.slug === company).showInTasks, false);
  assert.equal((await board.loadBoard(date, await loadTaskAccess(owner))).issues.length, 5);
});

test('관리자 날짜 이월은 개인 오늘 항목을 이동하거나 삭제하지 않는다', async () => {
  for (const [id, slug] of [['private-open', personal], ['private-done', PERSONAL_ISSUES_SLUG], ['company-open', company]]) {
    await add(id, slug); await board.moveIssue(id, 'today', '2026-09-29');
  }
  await board.setIssueDone({ id: 'private-done', done: true, completionId: 'private-completion', today: '2026-09-29', now });
  const before = await prisma.issue.findMany({ where: { id: { startsWith: 'private-' } }, orderBy: { id: 'asc' } });
  assert.deepEqual((await board.loadBoard(date, access)).issues.map(row => row.id), ['company-open']);
  assert.deepEqual(await prisma.issue.findMany({ where: { id: { startsWith: 'private-' } }, orderBy: { id: 'asc' } }), before);
  assert.equal(await prisma.completion.count(), 1);
});

test('완료 원본 이슈가 없어도 개인 완료 이력을 관리자에게 공개하지 않는다', async () => {
  await prisma.completion.createMany({ data: [company, personal, PERSONAL_ISSUES_SLUG, 'common'].map((projectSlug, index) => ({ id: `completion-${index}`, projectSlug, title: projectSlug, completedOn: date, completedAt: new Date(now) })) });
  assert.deepEqual((await listCompletions(date, date, access)).map(row => row.projectSlug).sort(), [company, 'common'].sort());
  assert.equal((await listCompletions(date, date, await loadTaskAccess(owner))).length, 4);
});

test('개인 이슈의 생성·이동·완료·편집·삭제와 혼합 일괄 요청을 거부하고 전체 데이터를 보존한다', async () => {
  await add('private', personal); await add('personal', PERSONAL_ISSUES_SLUG); await add('company');
  await board.createCustomProject({ slug: personal, title: '숨김', now });
  const snapshot = await prisma.issue.findMany({ orderBy: { id: 'asc' } });
  for (const id of ['private', 'personal']) {
    await assert.rejects(() => board.setIssueTitle(id, '변경', access), denied);
    await assert.rejects(() => board.moveIssue(id, 'today', date, access), denied);
    await assert.rejects(() => board.moveIssue(id, 'pool', date, access), denied);
    await assert.rejects(() => board.setIssueDone({ id, done: true, completionId: 'blocked', today: date, now }, access), denied);
    await assert.rejects(() => board.deleteIssue(id, access), denied);
    await assert.rejects(() => board.movePoolIssues({ ids: ['company', id], action: 'today', today: date }, access), denied);
    await assert.rejects(() => board.reorderIssues(['company', id], access), denied);
  }
  for (const projectSlug of [personal, PERSONAL_ISSUES_SLUG]) {
    await assert.rejects(() => board.createIssue({ id: 'blocked', projectSlug, title: '변경', now }, access), denied);
    await assert.rejects(() => board.movePoolIssues({ ids: ['company'], action: 'project', projectSlug }, access), denied);
  }
  await assert.rejects(() => board.deleteCustomProject(personal, access), denied);
  assert.deepEqual(await prisma.issue.findMany({ orderBy: { id: 'asc' } }), snapshot);
  assert.equal(await prisma.completion.count(), 0);
  assert.equal(await prisma.customProject.count(), 1);
});

test('관리자는 일반 이슈의 기존 편집·오늘 이동·완료·삭제를 사용한다', async () => {
  await board.createIssue({ id: 'allowed', projectSlug: 'common', title: '공통', now }, access);
  await board.setIssueTitle('allowed', '수정', access);
  await board.movePoolIssues({ ids: ['allowed'], action: 'today', today: date }, access);
  await board.setIssueDone({ id: 'allowed', done: true, completionId: 'allowed-completion', today: date, now }, access);
  assert.equal((await listCompletions(date, date, access))[0].title, '수정');
  await board.moveIssue('allowed', 'pool', date, access);
  assert.equal(await prisma.completion.count(), 0);
  await board.reorderIssues(['allowed'], access);
  await board.deleteIssue('allowed', access);
  assert.equal(await prisma.issue.count(), 0);
});

test('관리자 순서 변경은 개인 프로젝트의 순서·접힘 상태를 보존한다', async () => {
  await board.saveSettings({ projectOrder: [personal, 'a', PERSONAL_ISSUES_SLUG, 'b'], collapsedProjects: [personal, 'a', PERSONAL_ISSUES_SLUG] });
  await board.saveSettings({ projectOrder: ['b', 'a'], collapsedProjects: ['b'] }, access);
  const value = (await prisma.appSetting.findUnique({ where: { key: 'board' } })).value;
  assert.deepEqual(value.projectOrder, [personal, 'b', PERSONAL_ISSUES_SLUG, 'a']);
  assert.deepEqual(value.collapsedProjects, [personal, 'b', PERSONAL_ISSUES_SLUG]);
  const visible = await board.loadBoard(date, access);
  assert.deepEqual(visible.projectOrder, ['b', 'a']);
  assert.deepEqual(visible.collapsedProjects, ['b']);
});
