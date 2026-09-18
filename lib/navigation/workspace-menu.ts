import type { FlowNavigationProject } from "./flow-navigation.ts";
import { isPersonalProject } from "../personal-projects.ts";
import { projectNotesHref } from "../project-notes.ts";
import type { UiPreferences } from "../ui-preferences.ts";

export type WorkspaceSectionId =
  | "today"
  | "projects"
  | "personal"
  | "recruitment"
  | "records"
  | "ai-ops"
  | "settings"
  | "guide";

const ownerSections: WorkspaceSectionId[] = [
  "today",
  "projects",
  "personal",
  "recruitment",
  "records",
  "ai-ops",
  "settings",
  "guide",
];

export function workspaceSectionIds(role: string, projects: FlowNavigationProject[]): WorkspaceSectionId[] {
  if (role === "OWNER") return ownerSections;
  const hasCompanyProjects = projects.some(project => !isPersonalProject(project.slug));
  const hasPersonalProjects = projects.some(project => isPersonalProject(project.slug));
  return [
    ...(hasCompanyProjects ? ["projects" as const] : []),
    ...(hasPersonalProjects ? ["personal" as const] : []),
    ...(role === "ADMIN" ? ["settings" as const] : []),
  ];
}

export function workspaceSectionHref(id: WorkspaceSectionId, role: string, projects: FlowNavigationProject[]): string {
  if (id === "personal" && role !== "OWNER") {
    const project = projects.find(item => isPersonalProject(item.slug));
    if (project) return projectNotesHref(project.slug);
  }
  return {
    today: "/today",
    projects: "/flows",
    personal: "/personal",
    recruitment: "/recruitment",
    records: "/records",
    "ai-ops": "/ai-ops",
    settings: "/settings",
    guide: "/guide",
  }[id];
}

export function workspaceRoleLabel(role: string): string {
  return { OWNER: "소유자", ADMIN: "관리자", MEMBER: "멤버" }[role] ?? role;
}

export function scopePersonalProjectGroups(preferences: UiPreferences, projects: FlowNavigationProject[]): UiPreferences {
  const allowed = new Set(projects.filter(project => isPersonalProject(project.slug)).map(project => project.slug));
  return {
    exists: preferences.exists,
    values: Object.fromEntries(Object.entries(preferences.values).filter(([slug]) => allowed.has(slug))),
  };
}
