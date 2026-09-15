import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { MeetingDraftError, parseMeetingDraft, sha256, type MeetingDraft } from '../meeting-draft.ts';

async function inspect(db: Prisma.TransactionClient, draft: MeetingDraft) {
  const project = await db.flowProject.findUnique({ where: { slug: draft.projectSlug }, select: { slug: true, title: true } });
  const existing = await db.flowDocument.findUnique({ where: { projectSlug_slug: { projectSlug: draft.projectSlug, slug: draft.chart.slug } }, select: { slug: true, revision: true } });
  const duplicates = await db.$queryRaw<{ slug: string }[]>(Prisma.sql`
    SELECT slug FROM flow_document WHERE project_slug = ${draft.projectSlug}
      AND document->'content'->>'kind' = 'meeting'
      AND document->'content'->>'transcript' = ${draft.chart.content.transcript}
    ORDER BY slug
  `);
  return { project, existing, duplicates, canApply: Boolean(project) && !existing && !duplicates.length };
}

export async function inspectMeetingImport(input: unknown) {
  return inspect(prisma, parseMeetingDraft(input));
}

/** 신규 회의만 추가한다. 기존 회의와 사람의 편집은 갱신하지 않는다. */
export async function importMeeting(input: unknown, backupDirectory: string) {
  const draft = parseMeetingDraft(input);
  return prisma.$transaction(async tx => {
    // 같은 프로젝트로 들어오는 등록을 순서대로 처리한다.
    await tx.$queryRaw(Prisma.sql`SELECT slug FROM flow_project WHERE slug = ${draft.projectSlug} FOR UPDATE`);
    const check = await inspect(tx, draft);
    if (!check.project) throw new MeetingDraftError('등록된 프로젝트가 아닙니다. 프로젝트를 먼저 확인하세요.');
    if (check.existing || check.duplicates.length) throw new MeetingDraftError('같은 식별자 또는 전사본의 회의록이 있습니다. 기존 회의록을 덮어쓰지 않습니다.');
    const category = await tx.flowCategory.findUnique({ where: { projectSlug_slug: { projectSlug: draft.projectSlug, slug: 'meetings' } }, include: { charts: { orderBy: { slug: 'asc' } } } });
    const backupData = JSON.stringify({ project: check.project, category, newDocumentSlug: draft.chart.slug, newDocumentAbsent: true });
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const backup = resolve(backupDirectory, `before-meeting-${Date.now()}-${randomUUID()}.json`);
    await writeFile(backup, backupData, { flag: 'wx', mode: 0o600 });
    const backupSha256 = sha256(backupData);
    if (sha256(await readFile(backup)) !== backupSha256) throw new MeetingDraftError('백업 검증에 실패했습니다.');
    if (!category) {
      const last = await tx.flowCategory.aggregate({ where: { projectSlug: draft.projectSlug }, _max: { position: true } });
      await tx.flowCategory.create({ data: { projectSlug: draft.projectSlug, slug: 'meetings', title: '회의록', position: (last._max.position ?? -1) + 1 } });
    }
    const last = await tx.flowDocument.aggregate({ where: { projectSlug: draft.projectSlug, categorySlug: 'meetings' }, _max: { position: true } });
    const saved = await tx.flowDocument.create({ data: {
      projectSlug: draft.projectSlug, slug: draft.chart.slug, categorySlug: 'meetings', position: (last._max.position ?? -1) + 1,
      document: draft.chart as unknown as Prisma.InputJsonValue,
    } });
    if (!isDeepStrictEqual(saved.document, draft.chart)) throw new MeetingDraftError('저장 문서의 일치 검증에 실패했습니다.');
    return { status: 'created', projectSlug: draft.projectSlug, slug: saved.slug, revision: saved.revision, backup, backupSha256,
      href: `/flows/${encodeURIComponent(draft.projectSlug)}/meetings/${encodeURIComponent(saved.slug)}` };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
