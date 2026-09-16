/** 2026-09-17 ~/uk 바로 아래에서 확인한 프로젝트 목록. 배포 환경에서도 같은 목록을 사용한다. */
export const personalProjects = [
  { slug: "personal-flight-app", title: "flight-app" },
  { slug: "personal-galaxytty", title: "galaxytty" },
  { slug: "personal-ilchul", title: "ilchul" },
  { slug: "personal-project-management", title: "project-management" },
  { slug: "personal-sophiagreen-reservation", title: "sophiagreen-reservation" },
  { slug: "personal-youtube-sync", title: "youtube-sync" },
] as const;

const personalSlugs = new Set<string>(personalProjects.map(project => project.slug));
export function isPersonalProject(slug: string): boolean {
  return personalSlugs.has(slug);
}
