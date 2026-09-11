import type { FlowChart } from "@/components/flow/types";

// 업무 순서를 보여주는 요약 차트. 일상 근태와 신청·승인은 병행한다.
export const hrOverall: FlowChart = {
  slug: "hr-overall",
  title: "HR 통합 업무 흐름",
  description: "기준정보 설정 → 일상 인사·근태 관리 → 급여 확정 → 명세서 확인",
  caption: "HR의 네 가지 큰 업무 흐름",
  direction: "LR",
  groupDirection: "LR",
  nodeWidth: 270,

  howToRead: [
    "법인·조직·직원 정보와 급여 기준을 먼저 설정합니다.",
    "일상 업무에서는 세콤 근태 관리와 직원 신청·전자결재가 나란히 진행됩니다. 승인된 휴가 등은 근태에 함께 반영합니다.",
    "기준정보와 근태·승인 내역을 바탕으로 월 급여를 계산·확정하고 명세서를 발행하면, 직원이 확인하고 다운로드합니다.",
  ],

  groups: [
    { id: "g-master", label: "1. 기준정보 설정", kind: "store" },
    { id: "g-daily", label: "2. 일상 인사·근태 관리", kind: "entry" },
    { id: "g-payroll", label: "3. 월 급여 계산·확정", kind: "activate" },
    { id: "g-payslip", label: "4. 직원 명세서 확인", kind: "activate" },
  ],

  nodes: [
    {
      id: "master",
      group: "g-master",
      data: {
        kind: "store",
        label: "기준정보 설정",
        sub: "법인·조직·직원 정보 / 급여 기준",
      },
    },
    {
      id: "attendance",
      group: "g-daily",
      data: {
        kind: "deterministic",
        label: "세콤 연동 · 근태 관리",
        sub: "출퇴근 기록 수집 · 근태 반영",
      },
    },
    {
      id: "request",
      group: "g-daily",
      data: {
        kind: "entry",
        label: "직원 셀프서비스",
        sub: "본인 정보 조회·수정 / 휴가 등 신청",
      },
    },
    {
      id: "approval",
      group: "g-daily",
      data: {
        kind: "gate",
        label: "HR 전자결재",
        sub: "직원 신청 검토·승인 / 인사·근태 반영",
      },
    },
    {
      id: "payroll",
      group: "g-payroll",
      data: {
        kind: "activate",
        label: "급여 계산 · 확정",
        sub: ["급여 기준·근태·승인 내역 반영", "급여 확정 후 명세서 발행"],
      },
    },
    {
      id: "payslip",
      group: "g-payslip",
      data: {
        kind: "activate",
        label: "직원 급여명세서 확인",
        sub: "확정 명세서 조회 · 다운로드",
      },
    },
  ],

  edges: [
    { id: "e1", source: "master", target: "attendance", kind: "impl" },
    { id: "e2", source: "master", target: "request", kind: "impl" },
    { id: "e3", source: "request", target: "approval", kind: "impl" },
    { id: "e4", source: "attendance", target: "payroll", kind: "impl" },
    { id: "e5", source: "approval", target: "payroll", kind: "impl" },
    { id: "e6", source: "payroll", target: "payslip", kind: "impl" },
  ],
};
