import { isPersonalProject } from "@/lib/personal-projects";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectNotesTable } from "@/components/project-notes/project-notes-table";
import { ProjectRecordsWorkspace } from "@/components/project-notes/project-records-workspace";
import { ProjectEditor } from "@/components/projects/project-editor";
import { requireActor } from "@/lib/access/http";
import { getFlowProjectIdentity } from "@/lib/server/flow-catalog-store";
import { hasProjectNotes } from "@/lib/project-notes";

type PageProps = {
  params: Promise<{ project: string }>;
};

/** 공통 기준과 개인 프로젝트 기록만 지원한다. */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = (await params).project;
  const project = await getFlowProjectIdentity(slug);
  if (!project || !hasProjectNotes(project)) return {};
  return {
    title: `${isPersonalProject(project) ? "기록" : "명심할 점"} — ${project.title} — 프로젝트 매니지먼트`,
    description: isPersonalProject(project) ? `${project.title} 프로젝트 개요와 작업별 경험·근거` : `${project.title} 프로젝트 진행 시 놓치면 안 되는 기준과 주의사항`,
  };
}

export default async function ProjectNotesPage({ params }: PageProps) {
  const { project: projectSlug } = await params;
  const project = await getFlowProjectIdentity(projectSlug);
  if (!project || !hasProjectNotes(project)) notFound();
  const personal = isPersonalProject(project);
  if (personal && (await requireActor()).role !== 'OWNER') notFound();

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description={personal ? `${project.title} 프로젝트 개요와 직접 수행한 작업·판단·결과·근거를 정리합니다.` : `${project.title} 프로젝트를 진행하면서 놓치면 안 되는 기준과 주의사항을 관리합니다.`}
        title={isPersonalProject(project) ? "기록" : "명심할 점"}
        actions={personal ? <ProjectEditor scope="PERSONAL" slug={project.slug} /> : undefined}
      />
      <div className="px-6 py-5">
        <nav
          aria-label="위치"
          className="mb-3 flex items-center gap-1.5 text-[11px] text-[var(--bi-muted)]"
        >
          <span>{project.title}</span>
          <span aria-hidden>›</span>
          <span className="font-semibold text-[var(--bi-fg)]">{isPersonalProject(project) ? "기록" : "명심할 점"}</span>
        </nav>
        {personal ? <ProjectRecordsWorkspace key={project.slug} projectSlug={project.slug} /> : <ProjectNotesTable projectSlug={project.slug} />}
      </div>
    </div>
  );
}
