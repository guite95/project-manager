import type {
  FlowCategory,
  FlowChart,
  FlowProject,
} from "@/components/flow/types";
import { changeControl } from "./change-control";
import { deliveryLifecycle } from "./delivery-lifecycle";
import { pricelistOverall } from "./pricelist-overall";
import { pricelistSummary } from "./pricelist-summary";
import { pricelistWorker } from "./pricelist-worker";

/* -------------------------------------------------------------------------
 * 플로우차트 레지스트리 — 프로젝트 → 카테고리 → 차트 3단.
 *
 * 새 플로우차트 추가 순서:
 *  1. `lib/flows/<slug>.ts` 에 FlowChart 를 선언한다 (기존 파일 복사 권장).
 *  2. 아래 flowProjects 의 알맞은 프로젝트/카테고리 charts 에 넣는다.
 * 사이드바·목록·상세 라우트가 전부 이 배열에서 파생되므로 그 외 등록은 없다.
 *
 * 불변식:
 *  - 프로젝트마다 카테고리 1개 이상, 카테고리마다 차트 1개 이상
 *    (resolveChart 의 [0] 폴백이 이 전제를 깔고 있다)
 *  - 차트 slug 는 같은 프로젝트 안에서만 유일하면 된다 (전역 유일 요구 없음)
 * ---------------------------------------------------------------------- */

export const flowProjects: FlowProject[] = [
  {
    slug: "common",
    title: "공통",
    intro:
      "고객사와 무관하게 반복 적용하는 **프로젝트 수행 표준**입니다. " +
      "착수부터 안정화까지의 딜리버리 라이프사이클과 요구사항 변경 통제 흐름을 담습니다.",
    categories: [
      {
        slug: "delivery",
        title: "프로젝트 수행",
        charts: [deliveryLifecycle, changeControl],
      },
    ],
  },
  {
    slug: "tns",
    title: "티앤에스",
    intro:
      "티앤에스 **가격표 자동 적재** 파이프라인입니다. " +
      "**요약 → 전체 → 워커 상세** 순서로, 앞의 것으로 설명하고 뒤의 것으로 구현합니다.",
    categories: [
      {
        slug: "pricelist",
        title: "가격표 자동 적재",
        charts: [pricelistSummary, pricelistOverall, pricelistWorker],
      },
    ],
  },
];

export function getProject(slug: string): FlowProject | undefined {
  return flowProjects.find((p) => p.slug === slug);
}

/**
 * 쿼리파람(cat/chart) → 실제 카테고리·차트. 못 찾으면 첫 카테고리·첫 차트로
 * 폴백한다 (404 아님 — 스펙의 폴백 규칙). cat 이 틀리면 chart 는 폴백된
 * 카테고리 안에서만 찾는다.
 */
export function resolveChart(
  project: FlowProject,
  catSlug?: string,
  chartSlug?: string
): { category: FlowCategory; chart: FlowChart } {
  const category =
    project.categories.find((c) => c.slug === catSlug) ?? project.categories[0];
  const chart =
    category.charts.find((c) => c.slug === chartSlug) ?? category.charts[0];
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

export function projectChartCount(project: FlowProject): number {
  return project.categories.reduce((n, c) => n + c.charts.length, 0);
}
