import type { FlowChart } from "@/components/flow/types";

/* -------------------------------------------------------------------------
 * 프로젝트 수행 표준 흐름 — 착수부터 안정화까지.
 *
 * 새 플로우차트를 만들 때 이 파일을 복사해서 nodes/edges 만 갈아끼우면 된다.
 * 좌표는 쓰지 않는다 (Dagre 가 계산). id 로만 연결한다.
 * ---------------------------------------------------------------------- */

export const deliveryLifecycle: FlowChart = {
  slug: "delivery-lifecycle",
  title: "프로젝트 수행 표준 흐름",
  description: "착수 → 요구사항 → 설계 → 개발 → 검수 → 이행 → 안정화",
  caption: "프로젝트 수행 표준 흐름",
  direction: "LR",

  nodes: [
    /* ===== 착수 ===== */
    {
      id: "deal",
      data: {
        kind: "intake",
        label: "계약 · 수주",
        sub: "견적 확정 → 계약 체결",
      },
    },
    {
      id: "kickoff",
      data: {
        kind: "core",
        label: "킥오프",
        sub: "범위·일정·담당자 합의",
        doc: "착수보고서",
      },
    },
    {
      id: "wbs",
      data: {
        kind: "core",
        label: "WBS 수립",
        sub: "작업 분해 · 일정 · 마일스톤",
        doc: "WBS",
      },
    },

    /* ===== 요구사항 ===== */
    {
      id: "interview",
      data: {
        kind: "intake",
        label: "고객 인터뷰",
        sub: "현업 업무 청취 · 녹취",
      },
    },
    {
      id: "req",
      data: {
        kind: "core",
        label: "요구사항 정의",
        sub: "기능 목록 · 우선순위 확정",
        doc: "요구사항 정의서",
      },
    },
    {
      id: "data-request",
      data: {
        kind: "core",
        label: "자료 요청",
        sub: "양식·마스터·연동 스펙 수집",
      },
    },
    {
      id: "scope-baseline",
      data: {
        kind: "core",
        label: "개발 범위 확정",
        sub: "요구사항 ↔ 범위 매핑 베이스라인",
        doc: "SOW",
      },
    },

    /* ===== 설계 ===== */
    {
      id: "arch",
      data: {
        kind: "core",
        label: "업무 아키텍처 설계",
        sub: "화면 흐름 · 도메인 경계",
      },
    },
    {
      id: "erd",
      data: {
        kind: "core",
        label: "데이터 모델 (ERD)",
        sub: "테이블 · 관계 · 시점 데이터",
        doc: "ERD",
      },
    },

    /* ===== 개발 · 검수 ===== */
    {
      id: "dev",
      data: {
        kind: "core",
        label: "개발",
        sub: "스프린트 단위 구현",
        timing: "주 단위 스프린트",
      },
    },
    {
      id: "progress",
      data: {
        kind: "core",
        label: "진척 보고",
        sub: "WBS 대비 진행률 · 리스크",
        timing: "주간",
        doc: "주간보고",
      },
    },
    {
      id: "scenario",
      data: {
        kind: "core",
        label: "시나리오 검수",
        sub: "고객이 직접 도는 테스트 케이스",
        doc: "검수 시나리오",
      },
    },
    {
      id: "defect",
      data: {
        kind: "core",
        label: "결함 처리",
        sub: "등록 → 배정 → 수정 → 재검증",
      },
    },
    {
      id: "change",
      data: {
        kind: "core",
        label: "범위 변경 관리",
        sub: "추가 요건 → 영향도 → 합의",
        doc: "변경 요청서",
      },
    },

    /* ===== 이행 · 안정화 ===== */
    {
      id: "migration",
      data: {
        kind: "core",
        label: "데이터 이행",
        sub: "기존 시스템 → 신규 적재·검증",
      },
    },
    {
      id: "golive",
      data: {
        kind: "core",
        label: "오픈 (Go-Live)",
        sub: "운영 전환 · 사용자 교육",
        doc: "운영 매뉴얼",
      },
    },
    {
      id: "stabilize",
      data: {
        kind: "core",
        label: "안정화",
        sub: "오픈 직후 집중 대응",
        timing: "오픈 후 N주",
      },
    },
    {
      id: "handover",
      data: {
        kind: "core",
        label: "인수인계 · 종료",
        sub: "산출물 이관 · 검수 확인",
        doc: "완료보고서",
      },
    },
    {
      id: "maintenance",
      data: {
        kind: "future",
        label: "유지보수 전환",
        sub: "SLA 기반 운영 계약",
      },
    },

    /* ===== 기준정보 ===== */
    { id: "m-member", data: { kind: "master", label: "프로젝트 멤버" } },
    { id: "m-manual", data: { kind: "master", label: "표준 정책·매뉴얼" } },
    { id: "m-repo", data: { kind: "master", label: "레포지토리·환경" } },
  ],

  edges: [
    /* 착수 */
    { id: "e1", source: "deal", target: "kickoff", kind: "impl" },
    { id: "e2", source: "kickoff", target: "wbs", kind: "impl" },
    { id: "e3", source: "kickoff", target: "interview", kind: "impl" },

    /* 요구사항 */
    { id: "e4", source: "interview", target: "req", kind: "impl" },
    { id: "e5", source: "interview", target: "data-request", kind: "impl" },
    { id: "e6", source: "data-request", target: "req", kind: "impl", label: "자료 수신" },
    { id: "e7", source: "req", target: "scope-baseline", kind: "impl" },
    { id: "e8", source: "wbs", target: "scope-baseline", kind: "impl", label: "일정 반영" },

    /* 설계 */
    { id: "e9", source: "scope-baseline", target: "arch", kind: "impl" },
    { id: "e10", source: "arch", target: "erd", kind: "impl" },

    /* 개발 */
    { id: "e11", source: "erd", target: "dev", kind: "impl" },
    { id: "e12", source: "dev", target: "scenario", kind: "impl", label: "기능 완료" },
    { id: "e13", source: "wbs", target: "progress", kind: "snapshot", label: "주간 스냅샷" },
    { id: "e14", source: "dev", target: "progress", kind: "snapshot" },

    /* 검수 루프 */
    { id: "e15", source: "scenario", target: "defect", kind: "impl", label: "실패 건" },
    { id: "e16", source: "defect", target: "dev", kind: "impl", label: "수정 요청" },
    { id: "e17", source: "scenario", target: "change", kind: "impl", label: "범위 밖 요건" },
    { id: "e18", source: "change", target: "scope-baseline", kind: "impl", label: "베이스라인 갱신" },

    /* 이행 */
    { id: "e19", source: "scenario", target: "migration", kind: "impl", label: "검수 통과" },
    { id: "e20", source: "migration", target: "golive", kind: "impl" },
    { id: "e21", source: "golive", target: "stabilize", kind: "impl" },
    { id: "e22", source: "stabilize", target: "handover", kind: "impl" },
    { id: "e23", source: "handover", target: "maintenance", kind: "future" },

    /* 기준정보 참조 */
    { id: "m1", source: "m-member", target: "kickoff", kind: "master" },
    { id: "m2", source: "m-manual", target: "scope-baseline", kind: "master" },
    { id: "m3", source: "m-repo", target: "dev", kind: "master" },
  ],
};
