export const personalProjectGroups = [
  { id: "portfolio", title: "포폴용 프로젝트" },
  { id: "toy", title: "토이 프로젝트" },
] as const;

export type PersonalProjectGroup = (typeof personalProjectGroups)[number]["id"];

/** 사용자가 선택한 개인 프로젝트 목록. 배포 환경에서도 같은 목록을 사용한다. */
export const personalProjects = [
  { slug: "personal-flight-app", title: "flight-app", group: "portfolio" },
  { slug: "personal-ilchul", title: "ilchul", group: "portfolio" },
  { slug: "personal-project-management", title: "project-management", group: "toy" },
] as const;

const personalSlugs = new Set<string>(personalProjects.map(project => project.slug));
export function isPersonalProject(slug: string): boolean {
  return personalSlugs.has(slug);
}

export function personalProjectGroup(slug: string, overrides: Record<string, unknown> = {}): PersonalProjectGroup | undefined {
  const project = personalProjects.find(project => project.slug === slug);
  if (!project) return undefined;
  const saved = overrides[slug];
  return saved === "portfolio" || saved === "toy" ? saved : project.group;
}
