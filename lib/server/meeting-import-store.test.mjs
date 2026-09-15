import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prisma } from './test-db.mjs';
import { prepareMeetingDraft, sha256 } from '../meeting-draft.ts';
import { importMeeting, inspectMeetingImport } from './meeting-import-store.ts';

const projectSlug = 'test-meeting-import';
const directory = await mkdtemp(join(tmpdir(), 'meeting-import-test-'));
const draft = prepareMeetingDraft({ projectSlug, slug: 'new-meeting', date: '2026-09-14', title: '테스트 회의', transcript: '김담당: 목록 전달\r\n',
  notes: { participants: ['김담당'], summary: '테스트', discussions: [], decisions: ['테스트 결정'], actionItems: [] } });
async function clear() {
  await prisma.flowDocument.deleteMany({ where: { projectSlug } });
  await prisma.flowCategory.deleteMany({ where: { projectSlug } });
  await prisma.flowProject.deleteMany({ where: { slug: projectSlug } });
}
beforeEach(async () => { await clear(); await prisma.flowProject.create({ data: { slug: projectSlug, title: '등록 테스트', position: 999 } }); });
after(async () => { await clear(); await prisma.$disconnect(); await rm(directory, { recursive: true, force: true }); });

test('검사는 쓰기 없이 끝나고 신규 등록은 검증된 백업과 한 문서만 만든다', async () => {
  assert.equal((await inspectMeetingImport(draft)).canApply, true);
  assert.equal(await prisma.flowCategory.count({ where: { projectSlug } }), 0);
  const result = await importMeeting(draft, directory);
  assert.equal(result.revision, 1);
  const raw = await readFile(result.backup);
  assert.equal(sha256(raw), result.backupSha256);
  assert.equal((await stat(result.backup)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(raw).category, null);
  const saved = await prisma.flowDocument.findUnique({ where: { projectSlug_slug: { projectSlug, slug: draft.chart.slug } } });
  assert.deepEqual(saved.document, draft.chart);
  assert.equal(await prisma.flowDocument.count({ where: { projectSlug } }), 1);
});
test('사람이 수정한 문서를 보존하고 slug 변경으로 동일 전사본을 중복 등록하지 못한다', async () => {
  await importMeeting(draft, directory);
  const edited = { ...draft.chart, content: { ...draft.chart.content, decisions: ['사람의 결정'] } };
  await prisma.flowDocument.update({ where: { projectSlug_slug: { projectSlug, slug: draft.chart.slug } }, data: { document: edited, revision: 2 } });
  assert.equal((await inspectMeetingImport(draft)).canApply, false);
  await assert.rejects(() => importMeeting(draft, directory));
  await assert.rejects(() => importMeeting({ ...draft, chart: { ...draft.chart, slug: 'different-slug' } }, directory));
  assert.deepEqual((await prisma.flowDocument.findFirst({ where: { projectSlug } })).document, edited);
});
test('백업 실패나 없는 프로젝트는 카테고리와 문서를 남기지 않는다', async () => {
  const file = join(directory, 'not-a-directory'); await writeFile(file, 'test');
  await assert.rejects(() => importMeeting(draft, file));
  await assert.rejects(() => importMeeting({ ...draft, projectSlug: 'test-meeting-missing' }, directory));
  assert.equal(await prisma.flowCategory.count({ where: { projectSlug } }), 0);
  assert.equal(await prisma.flowDocument.count({ where: { projectSlug } }), 0);
});
test('동시에 같은 원문을 등록해도 한 건만 생성된다', async () => {
  const results = await Promise.allSettled([importMeeting(draft, directory), importMeeting({ ...draft, chart: { ...draft.chart, slug: 'other-slug' } }, directory)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await prisma.flowDocument.count({ where: { projectSlug } }), 1);
});

test('CLI 검사와 파일 해시 검증 뒤에만 신규 등록한다', async () => {
  const script = fileURLToPath(new URL('../../skills/sync-sum/scripts/meeting.mjs', import.meta.url));
  const file = join(directory, 'draft.json');
  const raw = JSON.stringify(draft); await writeFile(file, raw);
  const run = args => execFileSync(process.execPath, [script, ...args], { env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const preview = JSON.parse(run(['inspect', '--file', file]));
  assert.equal(preview.canApply, true);
  assert.throws(() => run(['apply', '--file', file, '--sha256', 'changed', '--backup-dir', directory]));
  assert.equal(await prisma.flowDocument.count({ where: { projectSlug } }), 0);
  const result = JSON.parse(run(['apply', '--file', file, '--sha256', preview.sha256, '--backup-dir', directory]));
  assert.equal(result.status, 'created');
  assert.equal(JSON.parse(run(['inspect', '--file', file])).canApply, false);
});
