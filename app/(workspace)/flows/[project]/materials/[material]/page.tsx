import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectContentView } from '@/components/flow/project-content';
import { MaterialSelector } from '@/components/materials/material-selector';
import { getFlowProjectIdentity } from '@/lib/server/flow-catalog-store';
import { getMaterial, listMaterials } from '@/lib/server/materials-store';

type Props = { params: Promise<{ project: string; material: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, material } = await params;
  const record = await getMaterial(project, material);
  return { title: record ? `${record.chart.title} — 자료` : '자료' };
}
export default async function MaterialPage({ params }: Props) {
  const { project: slug, material } = await params;
  const project = await getFlowProjectIdentity(slug);
  if (!project || slug === 'common') notFound();
  const record = await getMaterial(slug, material);
  if (!record) notFound();
  const materials = await listMaterials(slug);
  return <>
    <MaterialSelector project={slug} projectTitle={project.title} materials={materials} selectedSlug={material} />
    <div className="w-full min-w-0 px-2 py-3 md:px-3">
    <h1 className="mb-2 break-words text-[20px] font-bold">{record.chart.title}</h1>
    <ProjectContentView key={material} chart={record.chart} />
  </div></>;
}
