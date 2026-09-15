import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MaterialLibrary } from '@/components/materials/material-library';
import { getFlowProjectIdentity } from '@/lib/server/flow-catalog-store';
import { listMaterials } from '@/lib/server/materials-store';

type Props = { params: Promise<{ project: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getFlowProjectIdentity((await params).project);
  return { title: project ? `자료 — ${project.title}` : '자료' };
}
export default async function MaterialsPage({ params }: Props) {
  const project = await getFlowProjectIdentity((await params).project);
  if (!project || project.slug === 'common') notFound();
  return <MaterialLibrary project={project.slug} projectTitle={project.title} materials={await listMaterials(project.slug)} />;
}
