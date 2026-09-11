import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-payroll",
  "title": "09. 급여·원천세·지급명세서",
  "description": "HR 근태·급여 → 공제·급여 확정 → 급여 지급 → 원천세·연말정산·명세 제출",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "기존 HR 요약의 기준정보·세콤 근태·직원 신청/승인·급여 확정·명세서 흐름을 회계·세무까지 확장한 설계입니다. HR 요약 차트는 업무 요구안이며 실제 급여·세무 자동화 운영을 입증하지 않습니다.",
    "티앤에스 회계 자료에서 급여·복리후생 비용을 확인했습니다. 인사정보·소득 유형·과세/비과세 항목·공제·회사 부담금을 확인해 급여와 예수금·미지급 잔액을 구분합니다.",
    "급여 확정은 비용·채무 인식이고 실제 급여 이체는 채무 정산입니다. 회사 부담 보험료와 직원 공제액을 혼합하지 않으며, 지급 실패·부분 지급·추가 정산은 직원별 잔액으로 추적합니다.",
    "원천세와 지방소득세 특별징수, 지급명세서·간이지급명세서, 근로소득 연말정산, 퇴직·사업·기타소득은 해당 소득 유형과 제출 의무에 따라 분기합니다. 모든 유형을 모든 직원에게 일괄 적용하지 않습니다.",
    "연말정산은 증빙·공제 검토 후 추가 징수/환급을 급여에 반영하며 관련 명세와 신고를 대사합니다. 세율·기한·공제 요건은 적용 연도 기준으로 관리하고 직접 신고/파일 연계 방식은 별도 확정합니다."
  ],
  "nodes": [
    {
      "id": "hr",
      "data": {
        "kind": "entry",
        "label": "1. HR·근태·급여 기준 확인",
        "sub": [
          "인사: 직원·근태·휴가 승인 반영",
          "급여 항목·소득 유형·보험 기준"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "calc",
      "data": {
        "kind": "deterministic",
        "label": "2. 급여·공제 계산",
        "sub": [
          "과세/비과세·세금·보험 공제",
          "회사 부담금·실지급액 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "approve",
      "data": {
        "kind": "gate",
        "label": "3. 급여 검토·확정",
        "sub": [
          "HR·회계: 변동·오류 확인",
          "승인·급여명세서 발행"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "journal",
      "data": {
        "kind": "store",
        "label": "4. 급여·예수금 전표",
        "sub": [
          "급여비용·미지급급여·세금예수금",
          "보험료·회사 부담금 분리"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "pay",
      "data": {
        "kind": "deterministic",
        "label": "5. 급여 실제 이체 대사",
        "sub": [
          "직원별 확정액 ↔ 은행 출금",
          "실패·차액·부분 지급 추적"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "returns",
      "data": {
        "kind": "deterministic",
        "label": "6. 원천세·명세 자료 집계",
        "sub": [
          "근로·퇴직·사업·기타소득별",
          "지급 사실·세금·명세 합계 검토"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "annual",
      "data": {
        "kind": "verify",
        "label": "연말정산 · 추가 징수/환급",
        "sub": [
          "근로소득·공제 증빙 검토",
          "차액을 급여·예수금에 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "review",
      "data": {
        "kind": "verify",
        "label": "7. 신고·제출 대상 검토",
        "sub": [
          "원천세·지방소득세 특별징수",
          "지급/간이지급명세서 대상 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "file",
      "data": {
        "kind": "deterministic",
        "label": "8. 신고·명세 제출 · 접수",
        "sub": [
          "홈택스·위택스 / 신고파일 경로",
          "소득 유형별 주기·접수증 관리"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "taxpay",
      "data": {
        "kind": "activate",
        "label": "9. 세금·보험 납부 대사",
        "sub": [
          "신고·고지 금액 ↔ 실제 출금",
          "예수금·미지급 잔액 정리"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "fix",
      "data": {
        "kind": "gate",
        "label": "오류·반려·수정 처리",
        "sub": [
          "HR/회계 원자료·명세 보완",
          "직원 정산·원 신고 변경 이력"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "hr-calc",
      "source": "hr",
      "target": "calc",
      "kind": "impl"
    },
    {
      "id": "calc-approve",
      "source": "calc",
      "target": "approve",
      "kind": "impl"
    },
    {
      "id": "approve-journal",
      "source": "approve",
      "target": "journal",
      "kind": "impl"
    },
    {
      "id": "journal-pay",
      "source": "journal",
      "target": "pay",
      "kind": "impl"
    },
    {
      "id": "pay-returns",
      "source": "pay",
      "target": "returns",
      "kind": "impl"
    },
    {
      "id": "returns-review",
      "source": "returns",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "returns-annual",
      "source": "returns",
      "target": "annual",
      "kind": "impl",
      "label": "연말정산 시기"
    },
    {
      "id": "annual-review",
      "source": "annual",
      "target": "review",
      "kind": "impl",
      "label": "정산 결과"
    },
    {
      "id": "annual-pay",
      "source": "annual",
      "target": "pay",
      "kind": "ref",
      "label": "추가 지급·징수",
      "tone": "verify"
    },
    {
      "id": "review-file",
      "source": "review",
      "target": "file",
      "kind": "impl"
    },
    {
      "id": "file-taxpay",
      "source": "file",
      "target": "taxpay",
      "kind": "impl",
      "label": "접수 확인"
    },
    {
      "id": "file-fix",
      "source": "file",
      "target": "fix",
      "kind": "impl",
      "label": "반려·오류"
    },
    {
      "id": "fix-review",
      "source": "fix",
      "target": "review",
      "kind": "ref",
      "label": "보완 재검토",
      "tone": "verify"
    }
  ],
  "groups": [
    {
      "id": "workflow",
      "label": "업무 흐름 · 담당자와 회계 연결"
    }
  ]
};
