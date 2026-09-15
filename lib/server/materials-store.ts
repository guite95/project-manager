import { Prisma } from '@prisma/client';
import { cache } from 'react';
import { prisma } from '../db.ts';
import { parseFlowChart } from '../flows/document.ts';
import { MATERIAL_CATEGORY, validateMaterial, type MaterialContent, type MaterialSummary } from '../materials.ts';
import { getFlowDocument } from './flows-store.ts';

/** 목록에서는 파일 본문과 임베디드 자산을 읽지 않는다. */
export async function listMaterials(projectSlug: string): Promise<MaterialSummary[]> {
  const rows = await prisma.$queryRaw<(Omit<MaterialSummary, 'updatedAt'> & { updatedAt: Date })[]>(Prisma.sql`
    SELECT slug, document->>'title' AS title, document->>'description' AS description,
      COALESCE(document->'content'->>'format', document->'content'->>'kind') AS format,
      document->'content'->>'fileName' AS "fileName",
      (document->'content'->>'byteLength')::int AS "byteLength", updated_at AS "updatedAt"
    FROM flow_document WHERE project_slug = ${projectSlug}
      AND document->'content'->>'kind' IN ('material', 'html', 'slides')
    ORDER BY updated_at DESC, slug
  `);
  return rows.map(row => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

export const getMaterial = cache(async (project: string, slug: string) => {
  const record = await getFlowDocument(project, slug);
  return record && ['material', 'html', 'slides'].includes(record.chart.content?.kind ?? '') ? record : null;
});

export async function deleteMaterial(projectSlug: string, slug: string): Promise<boolean> {
  if (projectSlug === 'common') return false;
  const deleted = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM flow_document WHERE project_slug = ${projectSlug} AND slug = ${slug}
      AND document->'content'->>'kind' IN ('material', 'html', 'slides')
  `);
  return deleted > 0;
}

export async function createMaterial(projectSlug: string, title: string, content: MaterialContent) {
  validateMaterial(content);
  if (!title.trim() || title.trim().length > 200) throw new Error('자료 제목은 1~200자로 입력해 주세요.');
  const slug = `material-${crypto.randomUUID()}`;
  const chart = parseFlowChart({ slug, title: title.trim(), nodes: [], edges: [], content });
  return prisma.$transaction(async tx => {
    if (projectSlug === 'common' || !await tx.flowProject.findUnique({ where: { slug: projectSlug }, select: { slug: true } })) return null;
    // ON CONFLICT DO NOTHING으로 동시에 들어온 첫 업로드도 안전하게 처리한다.
    await tx.flowCategory.createMany({ data: [{ projectSlug, slug: MATERIAL_CATEGORY, title: '자료', position: 1000 }], skipDuplicates: true });
    await tx.flowDocument.create({ data: {
      projectSlug, slug, categorySlug: MATERIAL_CATEGORY, position: 0, document: chart as unknown as Prisma.InputJsonValue,
    } });
    return { slug, title: chart.title };
  });
}
