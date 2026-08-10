export type ExternalProjectLink = {
  title: string;
  href: string;
};

export type ExternalProject = {
  slug: string;
  title: string;
  links: ExternalProjectLink[];
};

export const externalProjects: ExternalProject[] = [
  {
    slug: "focus-ai",
    title: "포커스에이아이",
    links: [
      {
        title: "NotebookLM",
        href: "https://notebook.google.com/notebook/a17b9008-778c-407a-8ca0-08bd2e8a0f2e?authuser=2",
      },
    ],
  },
];

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
