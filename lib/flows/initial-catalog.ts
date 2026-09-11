import type {
  FlowCategory,
  FlowChart,
  FlowProject,
} from "@/components/flow/types";
import { changeControl } from "./change-control.ts";
import { tnsErdCharts } from "../erd/tns.ts";
import { deliveryLifecycle } from "./delivery-lifecycle.ts";
import { financeOverall } from "./finance-overall.ts";
import { financeDetails } from "./finance-details.ts";
import { hrOverall } from "./hr-overall.ts";
import { pricelistHumanReview } from "./pricelist-human-review.ts";
import { pricelistOverall } from "./pricelist-overall.ts";
import { pricelistSummary } from "./pricelist-summary.ts";
import { pricelistWorker } from "./pricelist-worker.ts";

// Frozen source fixtures for the initial DB migration. Never imported by runtime pages.
export const initialFlowProjects: FlowProject[] = [
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
      "티앤에스의 **가격표 자동 적재**, **HR 통합 업무**, **회계·재무** 흐름과 **데이터베이스 ERD**입니다. " +
      "각 카테고리에서 원천 데이터, 사람의 승인·검토 경계, " +
      "후속 업무로 이어지는 확정 결과를 확인합니다.",
    categories: [
      {
        slug: "pricelist",
        title: "가격표 자동 적재",
        charts: [
          pricelistSummary,
          pricelistHumanReview,
          pricelistOverall,
          pricelistWorker,
        ],
      },
      {
        slug: "hr",
        title: "HR",
        charts: [hrOverall],
      },
      {
        slug: "finance",
        title: "회계·재무",
        charts: [financeOverall, ...financeDetails],
      },
      {
        slug: "erd",
        title: "ERD",
        charts: tnsErdCharts,
      },
    ],
  },
];
