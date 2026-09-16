import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.ts';
import { parseFlowEnvelope } from '../flows/cli-document.ts';
import { FlowDocumentError, parseFlowChart } from '../flows/document.ts';
import { preserveFlowLayout } from '../flows/layout.ts';

/** 원문 백업을 검증한 뒤 revision 조건으로 저장한다. */
export async function applyFlowEnvelope(input: unknown, backupDirectory = join(homedir(), '.pm-backups')) {
  const envelope = parseFlowEnvelope(input);
  const { projectSlug, categorySlug, revision } = envelope;
  const slug = envelope.chart.slug;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT slug FROM flow_document WHERE project_slug = ${projectSlug} AND slug = ${slug} FOR UPDATE`;
    const current = await tx.flowDocument.findUnique({ where: { projectSlug_slug: { projectSlug, slug } } });
    if ((current?.revision ?? 0) !== revision) throw new FlowDocumentError('revision 충돌: pull 후 최신 문서에 변경을 다시 적용하세요.');
    if (current && current.categorySlug !== categorySlug) throw new FlowDocumentError('카테고리 이동은 지원하지 않습니다.');
    if (!await tx.flowCategory.findUnique({ where: { projectSlug_slug: { projectSlug, slug: categorySlug } } })) throw new FlowDocumentError('기존 프로젝트/카테고리를 선택하세요.');
    const old = current ? parseFlowChart(current.document) : undefined;
    if (old?.erdDomain !== undefined || old?.content !== undefined) throw new FlowDocumentError('일반 플로우차트만 수정할 수 있습니다.');
    const chart = old ? preserveFlowLayout(old, envelope.chart) : envelope.chart;
    const before = JSON.stringify({ projectSlug, categorySlug, revision, chart: current?.document ?? null }, null, 2) + '\n';
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    const backup = join(backupDirectory, `${projectSlug}-${slug}-r${revision}-${randomUUID()}.json`);
    await writeFile(backup, before, { flag: 'wx', mode: 0o600 });
    const sha256 = digest(before);
    if (digest(await readFile(backup, 'utf8')) !== sha256) throw new Error('백업 검증 실패');
    if (current) {
      const result = await tx.flowDocument.updateMany({ where: { projectSlug, slug, revision }, data: { document: chart as unknown as Prisma.InputJsonValue, revision: { increment: 1 } } });
      if (result.count !== 1) throw new FlowDocumentError('revision 충돌');
    } else {
      // 같은 이름의 동시 생성은 DB 고유키가 거부한다.
      const last = await tx.flowDocument.aggregate({ where: { projectSlug, categorySlug }, _max: { position: true } });
      await tx.flowDocument.create({ data: { projectSlug, categorySlug, slug, position: (last._max.position ?? -1) + 1, document: chart as unknown as Prisma.InputJsonValue } });
    }
    const saved = await tx.flowDocument.findUniqueOrThrow({ where: { projectSlug_slug: { projectSlug, slug } } });
    if (saved.revision !== revision + 1) throw new Error('저장 검증 실패');
    // JSONB의 키 순서는 달라질 수 있으므로 구조로 비교한다.
    const { isDeepStrictEqual } = await import('node:util');
    if (!isDeepStrictEqual(saved.document, chart)) throw new Error('저장 내용 검증 실패');
    return { status: 'saved', revision: saved.revision, backup, sha256, chart };
  }, { timeout: 15000 });
}
