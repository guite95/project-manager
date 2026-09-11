import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-operations",
  "title": "04. 운영비·자산·차입금",
  "description": "임차료·경비 / 고정자산 / 차입·자본 → 증빙·승인 → 지급 → 잔액·기간 배분",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "티앤에스 제공 손익계산서에서 급여·복리후생·여비교통·임차료·통신비·수도광열비·감가상각·보험료·차량유지·지급수수료·이자비용 계정의 금액 존재를 확인했습니다. 고객별 실제 금액·거래처·계좌는 차트에 옮기지 않았습니다.",
    "제공 자료는 회계 결과의 근거입니다. 아래 경비 청구·승인·자산 등록·차입 관리의 상세 절차가 현재 구현되었거나 고객에게 확정됐다는 뜻은 아니며 전체 회계 확장 설계입니다.",
    "운영비는 귀속 기간과 과세·공제 여부를 검토합니다. 회사 카드 사용은 카드 미지급금으로, 직원 대납은 직원에게 지급할 금액으로 구분한 뒤 실제 지급을 연결합니다.",
    "자산은 취득·사용 개시·감가상각·이동·매각·폐기까지 관리합니다. 보증금·선급비용은 즉시 비용 처리하지 않고 잔액 또는 기간 배분 대상으로 관리합니다.",
    "차입금 수령은 매출이 아니고 원금 상환은 비용이 아닙니다. 이자·수수료를 구분하고 외화차입금의 환율 차이도 검토합니다. 자본 납입·배당은 손익 거래와 구분하며 실제 적용 여부와 승인 절차는 확인 대상입니다.",
    "급여는 별도 «급여·원천세·지급명세서» 차트로 연결됩니다. 회사 전체 실제 입출금과 지급 예정을 구분하고 미지급·선급·자산·차입 잔액은 결산으로 넘깁니다."
  ],
  "nodes": [
    {
      "id": "expense",
      "data": {
        "kind": "entry",
        "label": "1. 경비·운영비 발생",
        "sub": [
          "임차료·출장·차량·보험·수수료",
          "직원 청구 / 회사 카드 / 계산서"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "asset",
      "data": {
        "kind": "entry",
        "label": "1. 자산·보증금 취득",
        "sub": [
          "비품·시설·차량 등 자산 검토",
          "보증금·선급비용 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "loan",
      "data": {
        "kind": "entry",
        "label": "1. 차입·자본 거래 발생",
        "sub": [
          "차입·증자·원금 상환·배당",
          "계약·상환 일정·승인 근거"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "review",
      "data": {
        "kind": "verify",
        "label": "2. 업무 목적·증빙 검토",
        "sub": [
          "관리·회계: 귀속 기간·세금 구분",
          "비용/자산/부채/자본 분류"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "fix",
      "data": {
        "kind": "gate",
        "label": "증빙 누락 · 분류 보완",
        "sub": [
          "담당자 확인·추가 증빙 요청",
          "개인 사용·공제 오류 점검"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "approval",
      "data": {
        "kind": "gate",
        "label": "3. 지출·거래 승인",
        "sub": [
          "책임자: 목적·금액·지급처 확인",
          "반려 사유·수정 이력 보존"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "journal",
      "data": {
        "kind": "store",
        "label": "4. 전표 · 지급/수취 잔액",
        "sub": [
          "경비·자산·채무·자본 구분",
          "회사 카드·직원 대납 잔액 분리"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "cash",
      "data": {
        "kind": "deterministic",
        "label": "5. 실제 입출금 대사",
        "sub": [
          "회사 카드대금·직원 경비 지급",
          "차입 수령 / 원금·이자 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "register",
      "data": {
        "kind": "store",
        "label": "6. 보조부·상환 일정 갱신",
        "sub": [
          "자산대장·보증금·차입금 잔액",
          "계약별 만기·상환·지급 예정"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "period",
      "data": {
        "kind": "activate",
        "label": "7. 기간 배분 · 결산 인계",
        "sub": [
          "감가상각·선급 상각·미지급 이자",
          "손익·잔액·현금흐름 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "dispose",
      "data": {
        "kind": "gate",
        "label": "자산 매각·폐기 / 계약 종료",
        "sub": [
          "처분대가·장부가·손익 검토",
          "보증금 회수·잔액 정리"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "expense-review",
      "source": "expense",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "asset-review",
      "source": "asset",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "loan-review",
      "source": "loan",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "review-approval",
      "source": "review",
      "target": "approval",
      "kind": "impl",
      "label": "검토 완료"
    },
    {
      "id": "review-fix",
      "source": "review",
      "target": "fix",
      "kind": "impl",
      "label": "보완 필요"
    },
    {
      "id": "fix-approval",
      "source": "fix",
      "target": "approval",
      "kind": "impl",
      "label": "보완 확인"
    },
    {
      "id": "approval-journal",
      "source": "approval",
      "target": "journal",
      "kind": "impl"
    },
    {
      "id": "journal-cash",
      "source": "journal",
      "target": "cash",
      "kind": "impl"
    },
    {
      "id": "cash-register",
      "source": "cash",
      "target": "register",
      "kind": "impl"
    },
    {
      "id": "register-period",
      "source": "register",
      "target": "period",
      "kind": "impl"
    },
    {
      "id": "register-dispose",
      "source": "register",
      "target": "dispose",
      "kind": "impl",
      "label": "종료·처분 발생"
    },
    {
      "id": "dispose-period",
      "source": "dispose",
      "target": "period",
      "kind": "impl",
      "label": "조정 전표·잔액"
    }
  ],
  "groups": [
    {
      "id": "workflow",
      "label": "업무 흐름 · 담당자와 회계 연결"
    }
  ]
};
