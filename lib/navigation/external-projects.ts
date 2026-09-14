export type ExternalProjectLink = {
  title: string;
  href: string;
};

export type ExternalProject = {
  slug: string;
  title: string;
  links: ExternalProjectLink[];
};

export const externalProjects: ExternalProject[] = [];

export function filterExternalProjects(
  projects: ExternalProject[],
  query: string
): ExternalProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;

  return projects.flatMap((project) => {
    if (project.title.toLowerCase().includes(q)) return [project];
    const links = project.links.filter((link) =>
      link.title.toLowerCase().includes(q)
    );
    return links.length ? [{ ...project, links }] : [];
  });
}
