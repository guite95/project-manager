import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-journals",
  "title": "06. 전표·입출금·원장",
  "description": "계정·기초잔액 → 전표 초안 → 검토·확정 → 입출금 배분 → 원장·현금흐름",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "현행 참고: 전표 차대 균형 검증, 계산서와 입금 전표, 계산서별 입금 배분 및 역분개 로직이 있습니다. 모든 신규 업무를 완전한 회계로 처리한다는 뜻은 아니며 초안 승인·마감 통제·전체 계정 범위는 확장 설계입니다.",
    "기초잔액은 계정별 잔액과 거래처별 채권·채무, 재고·자산 보조부를 함께 대사합니다. 기존 장부 이관분과 새 거래를 중복 적재하지 않도록 적용 시작일을 정합니다.",
    "거래와 증빙의 회계 인식 이벤트가 전표의 원천입니다. 계정 자동 매핑은 초안이며 차대 균형·귀속 기간·거래처·세금·증빙을 검토한 뒤 확정합니다. 미분류를 임의 계정으로 자동 확정하지 않습니다.",
    "은행 입출금과 승인·카드 사용은 별개 자료입니다. 수금·지급 매칭이 정산 전표를 생성하는 경우 해당 거래를 다시 일반 입출금 전표로 생성하지 않습니다. 여러 채권·채무에 대한 배분 및 미배분 잔액을 보존합니다.",
    "회사 간 거래와 회사 내부 계좌 이체를 구분합니다. 계좌 이체는 양쪽을 연결해 회사 전체 현금 유입·유출에서 상계하고, 카드 매출은 수수료 차감 정산 및 카드 사용대금 출금과 구분합니다.",
    "확정 전표 오류는 원본 삭제 대신 역분개·정정 전표로 처리합니다. 마감 기간 수정은 승인된 재개방 또는 적절한 수정 기간 검토를 거치고 관련 신고에 미치는 영향도 추적합니다."
  ],
  "nodes": [
    {
      "id": "opening",
      "data": {
        "kind": "store",
        "label": "1. 계정·세금·기초잔액 설정",
        "sub": [
          "회사·기간·원천 적용일 확정",
          "계정 잔액 ↔ 보조부 대사"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "event",
      "data": {
        "kind": "entry",
        "label": "2. 원거래·증빙 인식 이벤트",
        "sub": [
          "매출·매입·급여·경비·수입·자산",
          "정산·결산 조정도 동일 원칙"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "draft",
      "data": {
        "kind": "deterministic",
        "label": "3. 자동 매핑 · 전표 초안",
        "sub": [
          "계정·거래처·부서/현장·세금",
          "수동 입력·원천 이벤트 중복 방지"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "review",
      "data": {
        "kind": "verify",
        "label": "4. 전표 검토·승인",
        "sub": [
          "차대 균형·기간·증빙·세금",
          "미분류·마감기간·중복 점검"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "fix",
      "data": {
        "kind": "gate",
        "label": "오류·미분류 보정",
        "sub": [
          "원자료 확인·계정/기간 보정",
          "검토자·보완 근거 기록"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "post",
      "data": {
        "kind": "store",
        "label": "5. 전표 확정 · 장부 반영",
        "sub": [
          "분개장·총계정원장·보조부",
          "원본·작성자·확정 이력 보존"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "bank",
      "data": {
        "kind": "entry",
        "label": "은행·카드·정산 자료 수집",
        "sub": [
          "실제 입출금·카드 승인/취소",
          "원천 중복·누락·수집 오류 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "allocation",
      "data": {
        "kind": "deterministic",
        "label": "6. 입출금·채권채무 배분",
        "sub": [
          "부분·합산 수금/지급 / 선수·선급",
          "카드 정산·수수료 / 내부이체 대사"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "unmatched",
      "data": {
        "kind": "gate",
        "label": "미매칭·차액 검토",
        "sub": [
          "입금자·지급처·수수료·과오납",
          "잔액 보존 · 담당자 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "settlepost",
      "data": {
        "kind": "deterministic",
        "label": "7. 정산 전표 · 잔액 반영",
        "sub": [
          "배분 확정 결과로 정산 전표",
          "동일 은행거래 중복 분개 방지"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "reports",
      "data": {
        "kind": "activate",
        "label": "8. 원장·시산표·현금흐름",
        "sub": [
          "실제와 예정 구분 / 내부이체 상계",
          "미수·미지급·미매칭 잔액 추적"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "reverse",
      "data": {
        "kind": "gate",
        "label": "확정 취소 · 역분개·정정",
        "sub": [
          "원본 연결 / 마감·신고 영향 검토",
          "잔액·배분 복구 후 수정 전표"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "opening-draft",
      "source": "opening",
      "target": "draft",
      "kind": "ref",
      "label": "처리 기준",
      "tone": "verify"
    },
    {
      "id": "event-draft",
      "source": "event",
      "target": "draft",
      "kind": "impl"
    },
    {
      "id": "draft-review",
      "source": "draft",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "review-fix",
      "source": "review",
      "target": "fix",
      "kind": "impl",
      "label": "보완"
    },
    {
      "id": "fix-post",
      "source": "fix",
      "target": "post",
      "kind": "impl",
      "label": "재검토 통과"
    },
    {
      "id": "review-post",
      "source": "review",
      "target": "post",
      "kind": "impl",
      "label": "승인"
    },
    {
      "id": "post-allocation",
      "source": "post",
      "target": "allocation",
      "kind": "impl",
      "label": "장부 잔액"
    },
    {
      "id": "bank-allocation",
      "source": "bank",
      "target": "allocation",
      "kind": "impl",
      "label": "실제 거래"
    },
    {
      "id": "allocation-unmatched",
      "source": "allocation",
      "target": "unmatched",
      "kind": "impl",
      "label": "미매칭·차액"
    },
    {
      "id": "unmatched-settlepost",
      "source": "unmatched",
      "target": "settlepost",
      "kind": "impl",
      "label": "확인 후 배분"
    },
    {
      "id": "allocation-settlepost",
      "source": "allocation",
      "target": "settlepost",
      "kind": "impl",
      "label": "확정"
    },
    {
      "id": "settlepost-reports",
      "source": "settlepost",
      "target": "reports",
      "kind": "impl"
    },
    {
      "id": "post-reports",
      "source": "post",
      "target": "reports",
      "kind": "ref",
      "label": "발생주의 장부",
      "tone": "verify"
    },
    {
      "id": "post-reverse",
      "source": "post",
      "target": "reverse",
      "kind": "impl",
      "label": "오류·취소"
    },
    {
      "id": "reverse-reports",
      "source": "reverse",
      "target": "reports",
      "kind": "impl",
      "label": "정정 결과"
    }
  ],
  "groups": [
    {
      "id": "workflow",
      "label": "업무 흐름 · 담당자와 회계 연결"
    }
  ]
};
