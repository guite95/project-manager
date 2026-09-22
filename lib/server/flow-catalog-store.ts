import type { ProjectContent } from "../flows/content.ts";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.ts";
import { resolveChart } from "../flows/registry.ts";
import { getFlowDocument } from "./flows-store.ts";
import type { FlowNavigationChart, FlowNavigationProject } from "../navigation/flow-navigation.ts";

export type FlowChartSummary = FlowNavigationChart & { erdDomain?: string; contentKind?: ProjectContent["kind"]; nodeCount: number; edgeCount: number };
export type FlowProjectSummary = {
  slug: string; title: string; scope: string; personalGroup: string | null; intro?: string;
  categories: { slug: string; title: string; charts: FlowChartSummary[] }[];
};
type CatalogRow = {
  projectSlug: string; projectTitle: string; scope: string; personalGroup: string | null; intro: string | null;
  categorySlug: string | null; categoryTitle: string | null;
  chartSlug: string | null; chartTitle: string | null; description: string | null;
  erdDomain: string | null; contentKind: ProjectContent["kind"] | null; nodeCount: number; edgeCount: number;
};

/** JSONB에서 필요한 필드만 조회한다. 그래프 전체를 Node.js로 가져오지 않는다. */
export async function readFlowCatalog(projectSlug?: string): Promise<FlowProjectSummary[]> {
  const rows = await prisma.$queryRaw<CatalogRow[]>(Prisma.sql`
    SELECT p.slug AS "projectSlug", p.title AS "projectTitle", p.scope, p.personal_group AS "personalGroup", p.intro,
      c.slug AS "categorySlug", c.title AS "categoryTitle",
      d.slug AS "chartSlug", d.document->>'title' AS "chartTitle",
      d.document->>'description' AS description, d.document->>'erdDomain' AS "erdDomain", d.document->'content'->>'kind' AS "contentKind",
      COALESCE(jsonb_array_length(d.document->'nodes'), 0)::int AS "nodeCount",
      COALESCE(jsonb_array_length(d.document->'edges'), 0)::int AS "edgeCount"
    FROM flow_project p
    LEFT JOIN flow_category c ON c.project_slug = p.slug
    LEFT JOIN flow_document d ON d.project_slug = c.project_slug AND d.category_slug = c.slug
    ${projectSlug === undefined ? Prisma.empty : Prisma.sql`WHERE p.slug = ${projectSlug}`}
    ORDER BY p.position, p.slug, c.position, c.slug, d.position, d.slug
  `);
  const projects = new Map<string, FlowProjectSummary>();
  for (const row of rows) {
    let project = projects.get(row.projectSlug);
    if (!project) {
      project = { slug: row.projectSlug, title: row.projectTitle, scope: row.scope, personalGroup: row.personalGroup, ...(row.intro === null ? {} : { intro: row.intro }), categories: [] };
      projects.set(row.projectSlug, project);
    }
    if (row.categorySlug === null) continue;
    let category = project.categories.find(item => item.slug === row.categorySlug);
    if (!category) {
      category = { slug: row.categorySlug, title: row.categoryTitle ?? row.categorySlug, charts: [] };
      project.categories.push(category);
    }
    if (row.chartSlug !== null) category.charts.push({
      slug: row.chartSlug, title: row.chartTitle ?? row.chartSlug,
      ...(row.description === null ? {} : { description: row.description }),
      ...(row.erdDomain === null ? {} : { erdDomain: row.erdDomain }),
      ...(row.contentKind == null ? {} : { contentKind: row.contentKind }),
      nodeCount: row.nodeCount, edgeCount: row.edgeCount,
    });
  }
  return [...projects.values()];
}

export function toFlowNavigation(projects: FlowProjectSummary[]): FlowNavigationProject[] {
  return projects.map(({ slug, title, scope, personalGroup, categories }) => ({ slug, title, scope, personalGroup, categories: flowCategories(categories).map(({ slug, title, charts }) => ({
    slug, title, charts: charts.map(({ slug, title, description }) => ({ slug, title, ...(description === undefined ? {} : { description }) })),
  })) }));
}

/** 자료·회의록 전용 메뉴의 문서와 과거의 빈 회의 안내는 일반 차트 메뉴에서 제외한다. */
export function flowCategories(categories: FlowProjectSummary['categories']): FlowProjectSummary['categories'] {
  return categories.flatMap(category => {
    const charts = category.charts.filter(chart => chart.contentKind !== 'material' && chart.contentKind !== 'meeting' &&
      !(category.slug === 'meetings' && chart.slug === 'meetings' && chart.contentKind === 'notice'));
    return category.charts.length && !charts.length ? [] : [{ ...category, charts }];
  });
}

export async function readChartPage(projectSlug: string, categorySlug?: string, chartSlug?: string) {
  const project = (await readFlowCatalog(projectSlug))[0];
  if (!project) return null;
  const selected = resolveChart(project, categorySlug, chartSlug);
  if (!selected) return null;
  const document = await getFlowDocument(projectSlug, selected.chart.slug);
  if (!document) return null;
  return { project, category: selected.category, chart: document.chart };
}

// React cache는 같은 서버 요청 안에서만 공유한다. 다음 요청에서는 DB를 다시 읽는다.
export const getFlowCatalog = cache(readFlowCatalog);
export const getChartPage = cache(readChartPage);
export const getFlowProjectIdentity = cache((slug: string) => prisma.flowProject.findUnique({
  where: { slug }, select: { slug: true, title: true, scope: true },
}));
