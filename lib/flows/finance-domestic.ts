import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-domestic",
  "title": "02. 국내 매입·입고·지급",
  "description": "구매 접수 → 국내 PO → 입고·증빙 대사 → 매입채무 → 지급·반품 정산",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "현행 참고: 국내 구매의 접수·PO·입고와 매입계산서 PO 매칭, 구매 분류별 전표 로직을 참고했습니다. 현행 분류에는 재고와 전시장 비용이 있으며, 이를 모든 구매의 비용 처리 규칙으로 일반화하지 않습니다.",
    "확장 설계: 발주·입고·계산서를 수량·금액 기준으로 대사합니다. 먼저 입고되면 미청구 매입/미지급 추정, 먼저 지급되면 선급금으로 구분하고 후속 증빙·입고 시 정리합니다.",
    "국내 물품 구매는 재고, 운영 소모품·용역은 비용, 장기간 사용하는 물품은 자산 여부를 판단합니다. 전시장 구매도 실제 사용 목적과 자산화 기준에 따라 검토하며 일괄 비용 처리하지 않습니다.",
    "공급사 대금은 승인·지급 예정과 은행 실제 출금을 구분합니다. 분할 지급·합산 지급은 대상 채무별로 배분하고 승인만으로 지급완료나 현금 유출을 만들지 않습니다.",
    "반품은 원 입고·계산서·지급과 연결합니다. 반환 수량, 수정계산서, 미지급 차감 또는 환급/차기 상계까지 대사한 뒤 잔액을 확정합니다. 관련 상세: 계산서·예외·연동, 전표·입출금·원장."
  ],
  "nodes": [
    {
      "id": "request",
      "data": {
        "kind": "entry",
        "label": "1. 국내 구매 접수",
        "sub": [
          "구매: 현장 수요·재고 보충",
          "전시장·운영 구매 목적 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "po",
      "data": {
        "kind": "deterministic",
        "label": "2. 공급사·PO 확정",
        "sub": [
          "품목·수량·단가·납품처",
          "선금/잔금·지급 예정 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "receipt",
      "data": {
        "kind": "deterministic",
        "label": "3. 입고·검수 확인",
        "sub": [
          "물류: 실제 도착·합격 수량",
          "부분 입고·파손·반품 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "invoice",
      "data": {
        "kind": "deterministic",
        "label": "3. 매입 증빙 수취",
        "sub": [
          "회계: 계산서·카드·영수증",
          "공급사·PO·입고 연결"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "review",
      "data": {
        "kind": "verify",
        "label": "4. 발주·입고·증빙 대사",
        "sub": [
          "수량·금액·세금·누락 확인",
          "재고/비용/자산·공제 여부 검토"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "exception",
      "data": {
        "kind": "gate",
        "label": "불일치 · 증빙 지연 조치",
        "sub": [
          "구매·회계: 재확인·수정 요청",
          "미청구 매입 등 임시 잔액 추적"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "ap",
      "data": {
        "kind": "store",
        "label": "5. 매입 전표 · 채무 반영",
        "sub": [
          "재고/비용/자산 · 매입세액",
          "공급사별 지급 잔액·만기"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "prepay",
      "data": {
        "kind": "store",
        "label": "선급금 지급 · 잔액 추적",
        "sub": [
          "선금 승인 → 실제 출금 확인",
          "입고·증빙 확정 후 대체"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "approval",
      "data": {
        "kind": "gate",
        "label": "6. 지급 요청 · 승인",
        "sub": [
          "재무: 지급 대상·금액·계좌",
          "미지급/중복 지급 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "pay",
      "data": {
        "kind": "deterministic",
        "label": "7. 실제 출금 · 채무 배분",
        "sub": [
          "은행 출금 ↔ 공급사·계산서",
          "분할/합산 지급 · 전표 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "return",
      "data": {
        "kind": "gate",
        "label": "반품 · 매입 조정",
        "sub": [
          "물류·회계: 반출·수정증빙",
          "채무 차감 / 환급·차기 상계"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "done",
      "data": {
        "kind": "activate",
        "label": "8. 구매·지급 잔액 확인",
        "sub": [
          "미입고·미청구·미지급 각각 관리",
          "원장·부가세·결산으로 인계"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "request-po",
      "source": "request",
      "target": "po",
      "kind": "impl"
    },
    {
      "id": "po-receipt",
      "source": "po",
      "target": "receipt",
      "kind": "impl"
    },
    {
      "id": "po-invoice",
      "source": "po",
      "target": "invoice",
      "kind": "impl"
    },
    {
      "id": "receipt-review",
      "source": "receipt",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "invoice-review",
      "source": "invoice",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "review-ap",
      "source": "review",
      "target": "ap",
      "kind": "impl",
      "label": "대사 완료"
    },
    {
      "id": "review-exception",
      "source": "review",
      "target": "exception",
      "kind": "impl",
      "label": "불일치"
    },
    {
      "id": "exception-ap",
      "source": "exception",
      "target": "ap",
      "kind": "impl",
      "label": "보정·추정 검토 후"
    },
    {
      "id": "po-prepay",
      "source": "po",
      "target": "prepay",
      "kind": "impl",
      "label": "선금 조건"
    },
    {
      "id": "prepay-ap",
      "source": "prepay",
      "target": "ap",
      "kind": "ref",
      "label": "선급 대체",
      "tone": "verify"
    },
    {
      "id": "ap-approval",
      "source": "ap",
      "target": "approval",
      "kind": "impl"
    },
    {
      "id": "approval-pay",
      "source": "approval",
      "target": "pay",
      "kind": "impl"
    },
    {
      "id": "pay-done",
      "source": "pay",
      "target": "done",
      "kind": "impl"
    },
    {
      "id": "receipt-return",
      "source": "receipt",
      "target": "return",
      "kind": "impl",
      "label": "반품 발생"
    },
    {
      "id": "return-done",
      "source": "return",
      "target": "done",
      "kind": "impl",
      "label": "조정 결과"
    }
  ],
  "groups": [
    {
      "id": "workflow",
      "label": "업무 흐름 · 담당자와 회계 연결"
    }
  ]
};
