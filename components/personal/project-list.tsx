"use client";

import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { personalProjectGroup, personalProjectGroups } from "@/lib/personal-projects";
import { materialsHref } from "@/lib/materials";
import { projectNotesHref } from "@/lib/project-notes";
import { meetingsHref } from "@/lib/meetings";
import { ProjectGroupSelect, usePersonalProjectGroups } from "./project-groups";

export function PersonalProjectList({ personalProjects }: { personalProjects: { slug: string; title: string }[] }) {
  const preferences = usePersonalProjectGroups();
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="개인 프로젝트" description="개인 프로젝트 목록입니다." />
      <section aria-label="개인 프로젝트 목록" className="px-6 py-5">
        <p className="mb-3 text-[12px] text-[var(--bi-muted)]">전체 {personalProjects.length}개</p>
        {personalProjectGroups.map(group => {
          const projects = personalProjects.filter(project => personalProjectGroup(project.slug, preferences.values) === group.id);
          return (
            <section key={group.id} aria-label={group.title} className="mb-6">
              <h2 className="mb-3 text-[14px] font-semibold">{group.title} <span className="text-[12px] font-normal text-[var(--bi-muted)]">{projects.length}개</span></h2>
              {projects.length ? <ul className="m-0 list-none divide-y divide-[var(--bi-border)] rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-card-bg)] p-0">
                {projects.map(project => (
                  <li key={project.slug} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="m-0 break-words text-[13px] font-semibold">{project.title}</h3>
                      <div className="w-44"><ProjectGroupSelect slug={project.slug} title={project.title} /></div>
                    </div>
                    <nav aria-label={`${project.title} 메뉴`} className="mt-2 flex gap-4 text-[12px] text-[var(--bi-accent)]">
                      <Link href={materialsHref(project.slug)} className="hover:underline">자료</Link>
                      <Link href={projectNotesHref(project.slug)} className="hover:underline">기록</Link>
                      <Link href={meetingsHref(project.slug)} className="hover:underline">회의록</Link>
                    </nav>
                  </li>
                ))}
              </ul> : <p className="rounded-[3px] border border-[var(--bi-border)] px-4 py-3 text-[12px] text-[var(--bi-muted)]">등록된 프로젝트가 없습니다.</p>}
            </section>
          );
        })}
      </section>
    </div>
  );
}
