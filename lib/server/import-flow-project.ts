import type { FlowProject } from "../../components/flow/types.ts";
import { prisma } from "../db.ts";
import { parseFlowChart } from "../flows/document.ts";

/** 새 프로젝트만 원자적으로 추가한다. 기존 데이터가 다르면 덮어쓰지 않는다. */
export async function importFlowProject(project: FlowProject) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(project.slug) || !project.title.trim()) throw new Error("프로젝트 식별자를 확인하세요.");
  const categories = new Set<string>();
  const charts = new Set<string>();
  for (const category of project.categories) {
    if (!category.slug || !category.title || categories.has(category.slug)) throw new Error("중복되거나 잘못된 분류입니다.");
    categories.add(category.slug);
    for (const chart of category.charts) {
      parseFlowChart(chart);
      if (charts.has(chart.slug)) throw new Error("프로젝트 안의 차트 식별자가 중복됩니다.");
      charts.add(chart.slug);
    }
  }
  return prisma.$transaction(async tx => {
    if (await tx.flowProject.findUnique({ where: { slug: project.slug } })) throw new Error("이미 있는 프로젝트입니다. 기존 데이터를 덮어쓰지 않습니다.");
    const last = await tx.flowProject.aggregate({ _max: { position: true } });
    await tx.flowProject.create({ data: {
      slug: project.slug, title: project.title, intro: project.intro, position: (last._max.position ?? -1) + 1,
      categories: { create: project.categories.map((category, position) => ({
        slug: category.slug, title: category.title, position,
        charts: { create: category.charts.map((chart, position) => ({
          slug: chart.slug, position, document: JSON.parse(JSON.stringify(chart)),
        })) },
      })) },
    } });
    return { project: project.slug, categories: categories.size, documents: charts.size };
  }, { isolationLevel: "Serializable" });
}
