import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectNotesTable } from "@/components/project-notes/project-notes-table";
import { flowProjects, getProject } from "@/lib/flows/registry";

type PageProps = {
  params: Promise<{ project: string }>;
};

export function generateStaticParams() {
  return flowProjects.map((project) => ({ project: project.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const project = getProject((await params).project);
  if (!project) return {};
  return {
    title: `명심할 점 — ${project.title} — 프로젝트 매니지먼트`,
    description: `${project.title} 프로젝트 진행 시 놓치면 안 되는 기준과 주의사항`,
  };
}

export default async function ProjectNotesPage({ params }: PageProps) {
  const { project: projectSlug } = await params;
  const project = getProject(projectSlug);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description={`${project.title} 프로젝트를 진행하면서 놓치면 안 되는 기준과 주의사항을 관리합니다.`}
        title="명심할 점"
      />
      <div className="px-6 py-5">
        <nav
          aria-label="위치"
          className="mb-3 flex items-center gap-1.5 text-[11px] text-[var(--bi-muted)]"
        >
          <span>{project.title}</span>
          <span aria-hidden>›</span>
          <span className="font-semibold text-[var(--bi-fg)]">명심할 점</span>
        </nav>
        <ProjectNotesTable projectSlug={project.slug} />
      </div>
    </div>
  );
}
