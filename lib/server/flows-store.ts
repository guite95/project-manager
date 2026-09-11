import type { Prisma } from '@prisma/client';
import type { FlowProject } from '../../components/flow/types.ts';
import { prisma } from '../db.ts';
import { FlowDocumentError, parseFlowChart } from '../flows/document.ts';
import type { ErdSnapshot } from '../erd/chart.ts';

/** No process/global cache: a new request must see DB edits without redeployment. */
export async function listFlowProjects(projectSlug?: string): Promise<FlowProject[]> {
  const rows = await prisma.flowProject.findMany({
    where: projectSlug ? {slug:projectSlug} : undefined,
    orderBy: [{position:'asc'},{slug:'asc'}],
    include:{categories:{orderBy:[{position:'asc'},{slug:'asc'}],include:{charts:{orderBy:[{position:'asc'},{slug:'asc'}]}}}},
  });
  return rows.map(p=>({slug:p.slug,title:p.title,...(p.intro===null?{}:{intro:p.intro}),categories:p.categories.map(c=>({slug:c.slug,title:c.title,charts:c.charts.map(ch=>parseFlowChart(ch.document))}))}));
}

export async function getFlowProject(slug: string): Promise<FlowProject | undefined> {
  return (await listFlowProjects(slug))[0];
}

export async function listFlowProjectNames() {
  return prisma.flowProject.findMany({select:{slug:true,title:true},orderBy:[{position:'asc'},{slug:'asc'}]});
}

export async function getFlowDocument(projectSlug: string, slug: string) {
  const row = await prisma.flowDocument.findUnique({where:{projectSlug_slug:{projectSlug,slug}}});
  return row ? {projectSlug,categorySlug:row.categorySlug,chart:parseFlowChart(row.document),revision:row.revision,updatedAt:row.updatedAt.toISOString()} : null;
}

export async function updateFlowDocument(projectSlug: string, slug: string, input: unknown, revision: number) {
  const chart = parseFlowChart(input);
  if(chart.slug !== slug || !Number.isSafeInteger(revision) || revision < 1) throw new FlowDocumentError('차트 식별자 또는 revision이 올바르지 않습니다.');
  return prisma.$transaction(async tx=>{
    const current = await tx.flowDocument.findUnique({where:{projectSlug_slug:{projectSlug,slug}}});
    if(!current) return {status:'missing' as const};
    // The ERD renderer derives its graph from the shared schema snapshot. Do not accept
    // graph-only edits that would disagree with its table detail/drill-down data.
    if(parseFlowChart(current.document).erdDomain !== undefined || chart.erdDomain !== undefined) throw new FlowDocumentError('ERD는 전체 스키마 스냅샷과 함께 갱신해야 합니다.');
    const result = await tx.flowDocument.updateMany({where:{projectSlug,slug,revision},data:{document:chart as unknown as Prisma.InputJsonValue,revision:{increment:1}}});
    if(result.count === 0) return {status:'conflict' as const};
    return {status:'updated' as const,revision:revision+1};
  });
}

export async function getTnsErdSnapshot(): Promise<ErdSnapshot> {
  const row = await prisma.appSetting.findUnique({where:{key:'erd:tns'}});
  if(!row) throw new Error('DB에 TNS ERD 스냅샷이 없습니다. 마이그레이션 상태를 확인하세요.');
  const value = row.value as unknown as ErdSnapshot;
  if(!value || !Array.isArray(value.models) || !Array.isArray(value.relations)) throw new Error('TNS ERD 스냅샷 형식이 올바르지 않습니다.');
  return value;
}
