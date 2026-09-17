/** 사용자가 선택한 개인 프로젝트 목록. 배포 환경에서도 같은 목록을 사용한다. */
export const personalProjects = [
  { slug: "personal-flight-app", title: "flight-app" },
  { slug: "personal-ilchul", title: "ilchul" },
  { slug: "personal-project-management", title: "project-management" },
] as const;

const personalSlugs = new Set<string>(personalProjects.map(project => project.slug));
export function isPersonalProject(slug: string): boolean {
  return personalSlugs.has(slug);
}
