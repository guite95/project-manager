import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-import",
  "title": "03. 해외 수입·외화송금·원가",
  "description": "PO·OC 확정 → 선금·생산 → 선적·통관 → 입고 → 물품·물류비 정산",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "현행 참고: PO·OC, 선금 조건, 생산, 선적·통관, 라인별 입고, 물품대금/물류비 결의와 원가 배부 로직을 확인했습니다. OC 문서 연결만으로 생산에 진입하지 않으며 담당자 OC 확정과 선금 조건을 함께 봅니다.",
    "B/L 연결과 실제 출항은 다릅니다. ETD는 예정일이며 실제 출항 증거가 아닙니다. 통관 반출은 TNS 창고의 입고 확정이 아니고, 부분 입고는 발주·선적 라인별 합격 수량으로 관리합니다.",
    "송금 회차는 계약 조건에 따라 생산 전·후로 발생합니다. 차트의 선금과 잔금은 대표 경로이며 모든 거래에 선금이나 선적 전 잔금을 강제하지 않습니다.",
    "회계 확장: 인도조건과 자산 인식 시점을 검토해 선급금·미착품·상품·외화채무를 구분합니다. 결제 환율과 장부금액 차이, 수수료는 별도 검토하고 물품 지급과 원가 인식을 같은 사건으로 취급하지 않습니다.",
    "매입가격·포장비·운임·관세 등 직접 원가와 공제 가능한 수입부가세를 구분합니다. 회계 원가는 적용 기준에 따라 배부하며 현행 PO 환율 대비 지급 차이 지표를 법정 회계의 외환차손익과 동일하게 취급하지 않습니다.",
    "거래 종결 시 전량 입고·물품대금·물류비·원가 배부를 각각 확인합니다. 예외 종결해도 미입고·미지급 잔액은 남습니다. 관련 상세: 국내 매입, 전표·입출금·원장, 결산·재무제표, 부가세 신고."
  ],
  "nodes": [
    {
      "id": "po",
      "data": {
        "kind": "entry",
        "label": "1. 해외 PO · OC 검토·확정",
        "sub": [
          "무역: 브랜드·품목·외화금액",
          "지급 회차·인도조건 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "terms",
      "data": {
        "kind": "gate",
        "label": "2. 선금 조건 확인",
        "sub": [
          "OC 확정 + 선금 회차 여부",
          "문서 연결만으로 생산 진입 금지"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "advance",
      "data": {
        "kind": "deterministic",
        "label": "3. 선금 승인 · 송금 대사",
        "sub": [
          "재무: 결의·실제 출금·외화액",
          "선급금 · 송금수수료 기록"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "production",
      "data": {
        "kind": "deterministic",
        "label": "4. 생산·픽업 진행",
        "sub": [
          "무역: 생산·픽업 실제 진행",
          "선금 없으면 확정 후 바로 진행"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "balance",
      "data": {
        "kind": "deterministic",
        "label": "물품대금 잔금 · 외화채무",
        "sub": [
          "계약 회차별 승인·분할 송금",
          "실제 환율·장부금액 대사"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "shipping",
      "data": {
        "kind": "deterministic",
        "label": "5. 분할 선적 · 실제 출항",
        "sub": [
          "B/L·상업송장·포장명세 연결",
          "예정일과 실제 출항 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "customs",
      "data": {
        "kind": "deterministic",
        "label": "6. 통관 · 수입 증빙 확인",
        "sub": [
          "수입신고·수입계산서·관세",
          "물류비 결의·지급 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "recognize",
      "data": {
        "kind": "verify",
        "label": "자산·외화채무 인식 검토",
        "sub": [
          "인도조건·소유/통제 이전 검토",
          "선급금·미착품·상품 대체"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "inbound",
      "data": {
        "kind": "deterministic",
        "label": "7. 도착 · 라인별 검수 확정",
        "sub": [
          "부분 합격 수량만 재고 반영",
          "창고 입고 / 현장직출 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "cost",
      "data": {
        "kind": "deterministic",
        "label": "8. 물품·포장·물류 원가 배부",
        "sub": [
          "예정/확정 비용 · 수입부가세 구분",
          "배부 기준·미배부 차액 검토"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "close",
      "data": {
        "kind": "activate",
        "label": "9. 수입 거래·잔액 종결 검토",
        "sub": [
          "미입고·물품 미지급·물류 미지급",
          "원가·전표 확인 / 예외 사유 보존"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "damage",
      "data": {
        "kind": "gate",
        "label": "파손·수량차이 · 클레임",
        "sub": [
          "정상 재고와 격리 · 공급사 협의",
          "반품·보상·채무 조정 근거"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "po-terms",
      "source": "po",
      "target": "terms",
      "kind": "impl"
    },
    {
      "id": "terms-advance",
      "source": "terms",
      "target": "advance",
      "kind": "impl",
      "label": "선금 있음"
    },
    {
      "id": "terms-production",
      "source": "terms",
      "target": "production",
      "kind": "impl",
      "label": "선금 없음"
    },
    {
      "id": "advance-production",
      "source": "advance",
      "target": "production",
      "kind": "impl",
      "label": "선금 완료"
    },
    {
      "id": "production-shipping",
      "source": "production",
      "target": "shipping",
      "kind": "impl"
    },
    {
      "id": "production-balance",
      "source": "production",
      "target": "balance",
      "kind": "impl",
      "label": "계약 지급 회차"
    },
    {
      "id": "shipping-customs",
      "source": "shipping",
      "target": "customs",
      "kind": "impl"
    },
    {
      "id": "shipping-recognize",
      "source": "shipping",
      "target": "recognize",
      "kind": "impl",
      "label": "인식 시점 검토"
    },
    {
      "id": "customs-inbound",
      "source": "customs",
      "target": "inbound",
      "kind": "impl"
    },
    {
      "id": "customs-cost",
      "source": "customs",
      "target": "cost",
      "kind": "impl",
      "label": "비용·수입 증빙"
    },
    {
      "id": "recognize-cost",
      "source": "recognize",
      "target": "cost",
      "kind": "impl",
      "label": "장부금액"
    },
    {
      "id": "balance-cost",
      "source": "balance",
      "target": "cost",
      "kind": "ref",
      "label": "송금·채무 대사",
      "tone": "verify"
    },
    {
      "id": "inbound-close",
      "source": "inbound",
      "target": "close",
      "kind": "impl"
    },
    {
      "id": "cost-close",
      "source": "cost",
      "target": "close",
      "kind": "impl"
    },
    {
      "id": "inbound-damage",
      "source": "inbound",
      "target": "damage",
      "kind": "impl",
      "label": "미합격·차이"
    },
    {
      "id": "damage-close",
      "source": "damage",
      "target": "close",
      "kind": "impl",
      "label": "조치·미결 잔액"
    }
  ],
  "groups": [
    {
      "id": "workflow",
      "label": "업무 흐름 · 담당자와 회계 연결"
    }
  ]
};
