export const personalProjectGroups = [
  { id: "portfolio", title: "포폴용 프로젝트" },
  { id: "toy", title: "토이 프로젝트" },
] as const;
export type PersonalProjectGroup = (typeof personalProjectGroups)[number]["id"];

export function isPersonalProject(project: { scope?: string } | null | undefined): boolean {
  return project?.scope === "PERSONAL";
}

/** 분류 값은 공유 DB의 프로젝트 메타데이터에서 전달된다. */
export function personalProjectGroup(slug: string, values: Record<string, unknown>): PersonalProjectGroup | undefined {
  const group = values[slug];
  return group === "portfolio" || group === "toy" ? group : undefined;
}
