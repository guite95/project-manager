import type { Metadata } from "next";
import { PersonalProjectList } from "@/components/personal/project-list";
import { isPersonalProject } from "@/lib/personal-projects";
import { getFlowCatalog } from "@/lib/server/flow-catalog-store";

export const metadata: Metadata = {
  title: "개인 프로젝트 — 프로젝트 매니지먼트",
  description: "개인 프로젝트 목록입니다.",
};

export default async function PersonalPage() {
  const personalProjects = (await getFlowCatalog()).filter(project => isPersonalProject(project));
  return <PersonalProjectList personalProjects={personalProjects.map(({ slug, title }) => ({ slug, title }))} />;
}
