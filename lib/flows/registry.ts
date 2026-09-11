import type { FlowCategory, FlowChart, FlowProject } from "@/components/flow/types";

/**
 * 쿼리파람(cat/chart) → 실제 카테고리·차트. 못 찾으면 첫 카테고리·첫 차트로
 * 폴백한다 (404 아님 — 스펙의 폴백 규칙). cat 이 틀리면 chart 는 폴백된
 * 카테고리 안에서만 찾는다.
 *
 * 카테고리나 차트가 하나도 없는 프로젝트면 `null`. 위 불변식이 깨진 상태이고
 * (뼈대만 먼저 등록한 경우 등) 호출부는 404 로 처리한다 — 여기서 그냥
 * `[0]` 을 쓰면 서버 렌더가 500 으로 터진다.
 */
export function resolveChart(
  project: FlowProject,
  catSlug?: string,
  chartSlug?: string
): { category: FlowCategory; chart: FlowChart } | null {
  const category =
    project.categories.find((c) => c.slug === catSlug) ?? project.categories[0];
  if (!category) return null;
  const chart =
    category.charts.find((c) => c.slug === chartSlug) ?? category.charts[0];
  if (!chart) return null;
  return { category, chart };
}

/** 차트 상세 주소 — `/flows/<project>?cat=<category>&chart=<chart>` */
export function chartHref(
  projectSlug: string,
  catSlug: string,
  chartSlug: string
): string {
  return `/flows/${projectSlug}?cat=${catSlug}&chart=${chartSlug}`;
}
