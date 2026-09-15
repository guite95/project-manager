import type { FlowNavigationProject } from "./flow-navigation.ts";
import { hasProjectNotes } from "../project-notes.ts";

export function searchSidebarProjects(projects: FlowNavigationProject[], query: string) {
  const q = query.trim().toLowerCase();
  return projects.flatMap(project => {
    const projectMatches = !q || project.title.toLowerCase().includes(q);
    const showNotes = hasProjectNotes(project.slug) && (projectMatches || "명심할 점 주의사항 우선순위".includes(q));
    const showMeetings = project.slug !== "common" && (projectMatches || "회의록 회의 전사본".includes(q));
    const showMaterials = project.slug !== "common" && (projectMatches || "자료 문서 pdf html 파일".includes(q));
    const categories = project.categories.flatMap(category => {
      const charts = projectMatches || category.title.toLowerCase().includes(q)
        ? category.charts
        : category.charts.filter(chart => `${chart.title} ${chart.description ?? ""}`.toLowerCase().includes(q));
      return charts.length ? [{ ...category, charts }] : [];
    });
    return projectMatches || showNotes || showMeetings || showMaterials || categories.length ? [{ project, categories, showNotes, showMeetings, showMaterials }] : [];
  });
}
