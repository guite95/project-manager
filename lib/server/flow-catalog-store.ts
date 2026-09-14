import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.ts";
import { resolveChart } from "../flows/registry.ts";
import { getFlowDocument } from "./flows-store.ts";
import type { FlowNavigationChart, FlowNavigationProject } from "../navigation/flow-navigation.ts";

export type FlowChartSummary = FlowNavigationChart & { erdDomain?: string; nodeCount: number; edgeCount: number };
export type FlowProjectSummary = {
  slug: string; title: string; intro?: string;
  categories: { slug: string; title: string; charts: FlowChartSummary[] }[];
};
type CatalogRow = {
  projectSlug: string; projectTitle: string; intro: string | null;
  categorySlug: string | null; categoryTitle: string | null;
  chartSlug: string | null; chartTitle: string | null; description: string | null;
  erdDomain: string | null; nodeCount: number; edgeCount: number;
};

/** JSONB에서 필요한 필드만 조회한다. 그래프 전체를 Node.js로 가져오지 않는다. */
export async function readFlowCatalog(projectSlug?: string): Promise<FlowProjectSummary[]> {
  const rows = await prisma.$queryRaw<CatalogRow[]>(Prisma.sql`
    SELECT p.slug AS "projectSlug", p.title AS "projectTitle", p.intro,
      c.slug AS "categorySlug", c.title AS "categoryTitle",
      d.slug AS "chartSlug", d.document->>'title' AS "chartTitle",
      d.document->>'description' AS description, d.document->>'erdDomain' AS "erdDomain",
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
      project = { slug: row.projectSlug, title: row.projectTitle, ...(row.intro === null ? {} : { intro: row.intro }), categories: [] };
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
      nodeCount: row.nodeCount, edgeCount: row.edgeCount,
    });
  }
  return [...projects.values()];
}

export function toFlowNavigation(projects: FlowProjectSummary[]): FlowNavigationProject[] {
  return projects.map(({ slug, title, categories }) => ({ slug, title, categories: categories.map(({ slug, title, charts }) => ({
    slug, title, charts: charts.map(({ slug, title, description }) => ({ slug, title, ...(description === undefined ? {} : { description }) })),
  })) }));
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
  where: { slug }, select: { slug: true, title: true },
}));
