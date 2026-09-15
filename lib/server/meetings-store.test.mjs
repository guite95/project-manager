import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import { prisma } from './test-db.mjs';
import { listMeetings, getMeeting } from './meetings-store.ts';
import { readFlowCatalog, toFlowNavigation } from './flow-catalog-store.ts';
import { updateFlowDocument } from './flows-store.ts';
import { editMeetingOutcomes } from '../meeting-edit.ts';

const projects = ['test-meetings-a', 'test-meetings-b'];
const content = { kind: 'meeting', date: '2026-09-14', participants: ['참석자'], summary: '본문은 목록에서 제외',
  discussions: [], decisions: [], actionItems: [], transcript: '전사본은 상세에서만 조회' };
async function clear() {
  await prisma.flowDocument.deleteMany({ where: { projectSlug: { in: projects } } });
  await prisma.flowCategory.deleteMany({ where: { projectSlug: { in: projects } } });
  await prisma.flowProject.deleteMany({ where: { slug: { in: projects } } });
}
beforeEach(async () => {
  await clear();
  for (const slug of projects) await prisma.flowProject.create({ data: { slug, title: slug, position: 999,
    categories: { create: [{ slug: 'meetings', title: '회의록', position: 0, charts: { create: [
      { slug: 'latest', position: 1, document: { slug: 'latest', title: slug, nodes: [], edges: [], content } },
      { slug: 'earlier', position: 0, document: { slug: 'earlier', title: '이전 회의', nodes: [], edges: [], content: { ...content, date: '2026-09-01' } } },
      { slug: 'meetings', position: 2, document: { slug: 'meetings', title: '빈 안내', nodes: [], edges: [], content: { kind: 'notice', text: '회의 0건' } } },
    ] } }] } } });
});
after(async () => { await clear(); await prisma.$disconnect(); });

test('프로젝트별 최신순 회의 목록은 본문과 원문을 포함하지 않는다', async () => {
  const list = await listMeetings(projects[0]);
  assert.deepEqual(list, [
    { slug: 'latest', title: projects[0], date: '2026-09-14', participants: ['참석자'] },
    { slug: 'earlier', title: '이전 회의', date: '2026-09-01', participants: ['참석자'] },
  ]);
  assert.deepEqual(await listMeetings("missing' OR 1=1 --"), []);
  assert.equal((await getMeeting(projects[1], 'latest')).title, projects[1]);
  assert.equal((await getMeeting(projects[0], 'latest')).content.transcript, content.transcript);
  assert.equal(await getMeeting(projects[0], 'meetings'), null);
  assert.equal(await getMeeting('missing', 'latest'), null);
  assert.equal(await getMeeting(projects[0], 'missing'), null);
});

test('회의 문서와 과거 빈 안내는 일반 차트 메뉴에서 중복 표시하지 않는다', async () => {
  assert.deepEqual(toFlowNavigation(await readFlowCatalog(projects[0]))[0].categories, []);
  assert.equal(await prisma.flowDocument.count({ where: { projectSlug: projects[0] } }), 3);
});

test('회의록 편집을 저장하고 오래된 편집은 거절하며 원문을 보존한다', async () => {
  const original = await getMeeting(projects[0], 'latest');
  const changes = { decisions: ['사람이 확인한 결정'], actionItems: [{ task: '자료 확인', owner: '담당자', dueDate: '2026-09-18' }] };
  assert.equal(original.revision, 1);
  assert.deepEqual(await updateFlowDocument(projects[0], 'latest', editMeetingOutcomes(original.chart, changes), original.revision), { status: 'updated', revision: 2 });
  assert.deepEqual(await updateFlowDocument(projects[0], 'latest', editMeetingOutcomes(original.chart, { decisions: ['오래된 수정'], actionItems: [] }), original.revision), { status: 'conflict' });
  const saved = await getMeeting(projects[0], 'latest');
  assert.deepEqual(saved.content, { ...content, ...changes });
  assert.deepEqual((await getMeeting(projects[1], 'latest')).content, content);
  await updateFlowDocument(projects[0], 'latest', editMeetingOutcomes(saved.chart, { decisions: [], actionItems: [] }), saved.revision);
  const empty = await getMeeting(projects[0], 'latest');
  assert.deepEqual(empty.content, content);
  assert.equal(empty.revision, 3);
});
