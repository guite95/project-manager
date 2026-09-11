import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-sales",
  "title": "01. 영업·출고·매출·수금",
  "description": "현장·견적·계약 → 조달·출고 → 매출·증빙 → 계좌 수금 / 고객 카드 정산",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "현행 참고: 티앤에스는 현장·견적·계약과 출고, 세금계산서, 입금 배분을 연결합니다. 현장 정산은 잔여 청구와 미수 잔액으로 판단하고 출고 진행은 별도로 확인합니다.",
    "현행 신규 계산서는 전량 출고 후 전량 발행하는 가드가 있습니다. 선금·중도금·잔금 비율은 결제 예정 관리용이며, 아래 선수금·부분 청구·선발행 예외는 전체 회계 확장 설계로 적용 조건을 별도 확정합니다.",
    "고객에게 먼저 받은 돈은 선수금으로 추적하고, 매출 인식 요건 충족 후 채권과 대체합니다. 출고·인도 사실, 회계상 매출 인식, 세금계산서 발급 시점은 각각 검토하며 결제 자체로 매출을 중복 생성하지 않습니다.",
    "고객 카드결제는 고객 채권을 카드사·PG 정산대기금으로 전환한 뒤 실제 입금·수수료·취소액을 대사하는 설계입니다. 현금 유입은 입금 시 반영하며 카드 사용액과 입금액을 이중 집계하지 않습니다.",
    "어음으로 받는 거래가 있으면 수취·만기·추심/할인·부도 경로를 별도 관리합니다. 어음 수취만으로 현금 유입을 만들지 않습니다. 반품·결제취소·수정계산서는 원거래와 연결해 채권·재고·전표·환급을 함께 조정합니다.",
    "관련 상세: 계산서·예외·연동, 전표·입출금·원장, 부가세 신고. 이 차트는 고객 카드 정산과 선수금 등을 포함한 확장안이며 운영 검증 결과가 아닙니다."
  ],
  "nodes": [
    {
      "id": "order",
      "data": {
        "kind": "entry",
        "label": "1. 현장·견적 → 계약 확정",
        "sub": [
          "영업: 품목·수량·가격·납품처",
          "선금·중도금·잔금 예정 설정"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "procure",
      "data": {
        "kind": "deterministic",
        "label": "2. 재고 배정 / 조달 요청",
        "sub": [
          "보유 재고·국내 구매·해외 수입",
          "납품 일정과 조달 진행 연결"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "ship",
      "data": {
        "kind": "deterministic",
        "label": "3. 출고·인도 실적 확인",
        "sub": [
          "물류: 피킹·패킹·출고 확정",
          "부분 출고·현장직출 수량 추적"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "revenue",
      "data": {
        "kind": "verify",
        "label": "4. 매출 인식·증빙 검토",
        "sub": [
          "회계: 인도·계약조건·세금 구분",
          "세금계산서/카드 증빙 중복 대사"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "ar",
      "data": {
        "kind": "store",
        "label": "5. 매출·채권 전표 반영",
        "sub": [
          "거래처·현장별 매출/미수 추적",
          "선수금 대체 · 청구 잔액 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "advance",
      "data": {
        "kind": "store",
        "label": "선입금 · 선수금 관리",
        "sub": [
          "납품 전 실제 입금과 계약 연결",
          "매출 전까지 선수금 잔액 유지"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "bank",
      "data": {
        "kind": "deterministic",
        "label": "6. 계좌 입금 배분",
        "sub": [
          "재무: 실제 입금 ↔ 고객 채권",
          "부분 수금·여러 청구 묶음 배분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "card",
      "data": {
        "kind": "deterministic",
        "label": "6. 고객 카드결제 확인",
        "sub": [
          "고객 채권 → 카드 정산대기금",
          "승인·취소 내역 / 입금 예정"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "cardpay",
      "data": {
        "kind": "deterministic",
        "label": "7. 카드사·PG 정산 대사",
        "sub": [
          "정산대기금 ↔ 입금·수수료·취소",
          "실제 입금만 현금 유입 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "bill",
      "data": {
        "kind": "deterministic",
        "label": "6. 받을어음 수취·추심",
        "sub": [
          "만기·추심/할인·부도 추적",
          "실제 입금 전까지 어음 잔액 관리"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "complete",
      "data": {
        "kind": "activate",
        "label": "8. 수금·현장 정산 확인",
        "sub": [
          "미청구·미수·정산대기 잔액",
          "잔여 건 연체 알림 / 결산 인계"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "returns",
      "data": {
        "kind": "gate",
        "label": "반품·취소 · 차액 조정",
        "sub": [
          "영업·물류·회계: 사유·수량 확인",
          "수정증빙·역분개·환급 검토"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "order-procure",
      "source": "order",
      "target": "procure",
      "kind": "impl"
    },
    {
      "id": "procure-ship",
      "source": "procure",
      "target": "ship",
      "kind": "impl"
    },
    {
      "id": "ship-revenue",
      "source": "ship",
      "target": "revenue",
      "kind": "impl"
    },
    {
      "id": "revenue-ar",
      "source": "revenue",
      "target": "ar",
      "kind": "impl"
    },
    {
      "id": "order-advance",
      "source": "order",
      "target": "advance",
      "kind": "impl",
      "label": "선입금 발생"
    },
    {
      "id": "advance-ar",
      "source": "advance",
      "target": "ar",
      "kind": "ref",
      "label": "인식 시 대체",
      "tone": "verify"
    },
    {
      "id": "ar-bank",
      "source": "ar",
      "target": "bank",
      "kind": "impl",
      "label": "계좌 수금"
    },
    {
      "id": "ar-card",
      "source": "ar",
      "target": "card",
      "kind": "impl",
      "label": "카드 수금"
    },
    {
      "id": "ar-bill",
      "source": "ar",
      "target": "bill",
      "kind": "impl",
      "label": "어음 수취"
    },
    {
      "id": "card-cardpay",
      "source": "card",
      "target": "cardpay",
      "kind": "impl"
    },
    {
      "id": "bank-complete",
      "source": "bank",
      "target": "complete",
      "kind": "impl"
    },
    {
      "id": "cardpay-complete",
      "source": "cardpay",
      "target": "complete",
      "kind": "impl"
    },
    {
      "id": "bill-complete",
      "source": "bill",
      "target": "complete",
      "kind": "impl",
      "label": "추심·정산 결과"
    },
    {
      "id": "ar-returns",
      "source": "ar",
      "target": "returns",
      "kind": "impl",
      "label": "반품·취소"
    },
    {
      "id": "returns-complete",
      "source": "returns",
      "target": "complete",
      "kind": "impl",
      "label": "조정 후 잔액"
    }
  ],
  "groups": [
    {
      "id": "workflow",
      "label": "업무 흐름 · 담당자와 회계 연결"
    }
  ]
};
