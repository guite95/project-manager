import type { Metadata } from "next";
import { PageHeader } from "@/components/erp/page-header";
import Link from "next/link";
import { isPersonalProject } from "@/lib/personal-projects";
import { getFlowCatalog } from "@/lib/server/flow-catalog-store";
import { materialsHref } from "@/lib/materials";
import { projectNotesHref } from "@/lib/project-notes";
import { meetingsHref } from "@/lib/meetings";
import { GitHubRepositoryForm, PersonalGitHubConnection } from "@/components/personal/github-connection";

export const metadata: Metadata = {
  title: "개인 프로젝트 — 프로젝트 매니지먼트",
  description: "개인 프로젝트 목록입니다.",
};

export default async function PersonalPage() {
  const personalProjects = (await getFlowCatalog()).filter(project => isPersonalProject(project.slug));
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="개인 프로젝트" description="개인 프로젝트 목록입니다." />
      <section aria-label="개인 프로젝트 목록" className="px-6 py-5">
        <PersonalGitHubConnection>
        <p className="mb-3 text-[12px] text-[var(--bi-muted)]">전체 {personalProjects.length}개</p>
        <ul className="m-0 list-none divide-y divide-[var(--bi-border)] rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-0">
          {personalProjects.map(project => (
            <li key={project.slug} className="px-4 py-3">
              <h3 className="m-0 break-words text-[13px] font-semibold">{project.title}</h3>
              <nav aria-label={`${project.title} 메뉴`} className="mt-2 flex gap-4 text-[12px] text-[var(--bi-accent)]">
                <Link href={materialsHref(project.slug)} className="hover:underline">자료</Link>
                <Link href={projectNotesHref(project.slug)} className="hover:underline">기록</Link>
                <Link href={meetingsHref(project.slug)} className="hover:underline">회의록</Link>
              </nav>
              <GitHubRepositoryForm projectSlug={project.slug} title={project.title} />
            </li>
          ))}
        </ul>
        </PersonalGitHubConnection>
      </section>
    </div>
  );
}
