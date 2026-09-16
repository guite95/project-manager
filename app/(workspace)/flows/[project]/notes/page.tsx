import { isPersonalProject } from "@/lib/personal-projects";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/erp/page-header";
import { ProjectNotesTable } from "@/components/project-notes/project-notes-table";
import { getFlowProjectIdentity } from "@/lib/server/flow-catalog-store";
import { hasProjectNotes } from "@/lib/project-notes";

type PageProps = {
  params: Promise<{ project: string }>;
};

/** 공통 기준과 개인 프로젝트 기록만 지원한다. */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = (await params).project;
  const project = hasProjectNotes(slug) ? await getFlowProjectIdentity(slug) : undefined;
  if (!project) return {};
  return {
    title: `${isPersonalProject(slug) ? "기록" : "명심할 점"} — ${project.title} — 프로젝트 매니지먼트`,
    description: `${project.title} 프로젝트 진행 시 놓치면 안 되는 기준과 주의사항`,
  };
}

export default async function ProjectNotesPage({ params }: PageProps) {
  const { project: projectSlug } = await params;
  if (!hasProjectNotes(projectSlug)) notFound();
  const project = await getFlowProjectIdentity(projectSlug);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        description={isPersonalProject(projectSlug) ? `${project.title} 작업 내용과 메모를 기록합니다.` : `${project.title} 프로젝트를 진행하면서 놓치면 안 되는 기준과 주의사항을 관리합니다.`}
        title={isPersonalProject(projectSlug) ? "기록" : "명심할 점"}
      />
      <div className="px-6 py-5">
        <nav
          aria-label="위치"
          className="mb-3 flex items-center gap-1.5 text-[11px] text-[var(--bi-muted)]"
        >
          <span>{project.title}</span>
          <span aria-hidden>›</span>
          <span className="font-semibold text-[var(--bi-fg)]">{isPersonalProject(projectSlug) ? "기록" : "명심할 점"}</span>
        </nav>
        <ProjectNotesTable projectSlug={project.slug} />
      </div>
    </div>
  );
}
