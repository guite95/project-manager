import type { FlowChart } from "@/components/flow/types";

/* -------------------------------------------------------------------------
 * 요구사항 변경 · 범위 관리 흐름.
 *
 * 위→아래(TB) 배치 예시. `direction` 만 바꾸면 렌더러가 핸들 위치까지 맞춘다.
 * ---------------------------------------------------------------------- */

export const changeControl: FlowChart = {
  slug: "change-control",
  title: "요구사항 변경 · 범위 관리",
  description: "추가 요건 접수부터 범위 반영 또는 반려까지의 판단 경로",
  caption: "변경 관리 흐름",
  direction: "TB",

  nodes: [
    {
      id: "raise",
      data: {
        kind: "intake",
        label: "추가 요건 접수",
        sub: "고객 요청 · 검수 중 발견 · 내부 제안",
      },
    },
    {
      id: "register",
      data: {
        kind: "core",
        label: "변경 요청 등록",
        sub: "요청자 · 배경 · 기대 효과 기록",
        doc: "변경 요청서",
      },
    },
    {
      id: "baseline-check",
      data: {
        kind: "core",
        label: "베이스라인 대조",
        sub: "확정 범위(SOW) 안인지 밖인지 판정",
      },
    },
    {
      id: "in-scope",
      data: {
        kind: "core",
        label: "범위 내 — 결함/보완",
        sub: "추가 비용 없이 백로그 편입",
      },
    },
    {
      id: "impact",
      data: {
        kind: "core",
        label: "영향도 분석",
        sub: "공수 · 일정 · 연관 기능 · 리스크",
      },
    },
    {
      id: "estimate",
      data: {
        kind: "core",
        label: "공수 산정 · 견적",
        sub: "MD 환산 → 금액 · 일정 지연분",
        doc: "변경 견적서",
      },
    },
    {
      id: "review",
      data: {
        kind: "core",
        label: "고객 협의",
        sub: "수용 / 보류 / 반려 결정",
        timing: "주간 정기 회의",
      },
    },
    {
      id: "reject",
      data: {
        kind: "master",
        label: "반려 · 보류",
        sub: "사유 기록 후 종료",
      },
    },
    {
      id: "contract",
      data: {
        kind: "future",
        label: "계약 변경",
        sub: "금액·기간 변경 시 계약서 반영",
        doc: "변경 계약서",
      },
    },
    {
      id: "update-scope",
      data: {
        kind: "core",
        label: "범위 · WBS 갱신",
        sub: "베이스라인 재설정 · 일정 재배치",
        doc: "WBS (개정)",
      },
    },
    {
      id: "backlog",
      data: {
        kind: "core",
        label: "개발 백로그 반영",
        sub: "스프린트 배정 → 구현",
      },
    },
    { id: "m-policy", data: { kind: "master", label: "변경 관리 정책" } },
  ],

  edges: [
    { id: "c1", source: "raise", target: "register", kind: "impl" },
    { id: "c2", source: "register", target: "baseline-check", kind: "impl" },
    { id: "c3", source: "baseline-check", target: "in-scope", kind: "impl", label: "범위 내" },
    { id: "c4", source: "baseline-check", target: "impact", kind: "impl", label: "범위 밖" },
    { id: "c5", source: "in-scope", target: "backlog", kind: "impl" },
    { id: "c6", source: "impact", target: "estimate", kind: "impl" },
    { id: "c7", source: "estimate", target: "review", kind: "impl" },
    { id: "c8", source: "review", target: "reject", kind: "master", label: "반려" },
    { id: "c9", source: "review", target: "contract", kind: "future", label: "금액·기간 변경 시" },
    { id: "c10", source: "contract", target: "update-scope", kind: "future" },
    // 이 선은 contract 카드를 스쳐 지나가므로 라벨을 달면 그 카드 글자를 덮는다.
    // 분기 조건은 반대편(c9)에 적어서 "그 외는 바로 범위 갱신"으로 읽히게 했다.
    { id: "c11", source: "review", target: "update-scope", kind: "impl" },
    { id: "c12", source: "update-scope", target: "backlog", kind: "impl" },
    { id: "m1", source: "m-policy", target: "baseline-check", kind: "master" },
  ],
};
