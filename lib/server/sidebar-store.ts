import { prisma } from "../db.ts";
import { externalProjects } from "../navigation/external-projects.ts";
import { defaultSidebarOrder, normalizeSidebarOrder } from "../navigation/sidebar-order.ts";

const SETTING_KEY = "sidebar:project-order";

export class SidebarOrderError extends Error {}

async function defaultOrder(flowSlugs?: string[]) {
  const slugs = flowSlugs ?? (await prisma.flowProject.findMany({
    select: {slug:true}, orderBy:[{position:"asc"},{slug:"asc"}],
  })).map((project) => project.slug);
  return defaultSidebarOrder(slugs, externalProjects.map((project) => project.slug));
}

export async function loadSidebarOrder(flowSlugs?: string[]): Promise<string[]> {
  const [defaults, setting] = await Promise.all([
    defaultOrder(flowSlugs),
    prisma.appSetting.findUnique({where:{key:SETTING_KEY}}),
  ]);
  return normalizeSidebarOrder(defaults, setting?.value);
}

export async function saveSidebarOrder(value: unknown): Promise<string[]> {
  const defaults = await defaultOrder();
  if (!Array.isArray(value) || value.some((slug) => typeof slug !== "string" || !defaults.includes(slug)) ||
      new Set(value).size !== value.length) {
    throw new SidebarOrderError("프로젝트 순서가 올바르지 않습니다. 새로고침 후 다시 시도해 주세요.");
  }
  const order = normalizeSidebarOrder(defaults, value);
  await prisma.appSetting.upsert({
    where:{key:SETTING_KEY},
    create:{key:SETTING_KEY,value:order},
    update:{value:order},
  });
  return order;
}
