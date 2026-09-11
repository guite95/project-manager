import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-closing",
  "title": "07. 월·연말 결산·재무제표",
  "description": "거래 마감 점검 → 재고·자산·외화·기간 조정 → 시산표 → 재무제표 → 이월",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "현행 수입 원가·입고·분개 자료와 고객의 재무상태표·손익계산서·시산표·현금흐름표·자산 관련 파일을 참고한 결산 확장 설계입니다. 장부 파일 존재가 현재 ERP 결산 자동화의 증거는 아닙니다.",
    "은행·채권·채무와 재고·자산·차입금 보조부를 총계정원장과 대사합니다. 일부 거래가 미수·미지급이라는 이유로 매출·비용을 누락하지 않고 기간 귀속과 인식 요건을 판단합니다.",
    "수입 상품은 미착·입고·판매된 수량과 예정/확정 원가를 구분합니다. 통관비·포장비 등 후행 비용이 확정되면 기말 재고와 이미 판매된 매출원가에 미치는 영향을 검토합니다.",
    "외화 자산·부채 평가, 선급·선수·미수·미지급 조정, 감가상각·충당금 등을 적용 회계기준에 맞춰 검토합니다. 추정값에는 근거와 담당자의 검토를 남깁니다.",
    "법인세 등 세액과 필요한 세금비용·부채 조정은 «법인세·지방소득세» 차트에서 검토한 결과로 반영하고 최종 재무제표를 확정합니다. 재무제표의 구성·주석·이연법인세 적용은 회사 회계기준에 맞춰 확정합니다.",
    "결산 검토 중 수정은 장부로 돌아가 재검증합니다. 최종 마감 후 기초잔액을 이월하고 재개방·전표 수정·수정신고 이력을 연계합니다. 현금흐름표와 운영용 입출금 대시보드는 목적과 표시 기준을 구분합니다."
  ],
  "nodes": [
    {
      "id": "cutoff",
      "data": {
        "kind": "entry",
        "label": "1. 결산 기간·미처리 점검",
        "sub": [
          "회계: 증빙 누락·미확정 전표",
          "영업·구매·HR 담당자 마감 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "balances",
      "data": {
        "kind": "verify",
        "label": "2. 장부·보조부 잔액 대사",
        "sub": [
          "은행·카드·채권·채무·차입금",
          "미매칭·선수·선급·연체 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "stock",
      "data": {
        "kind": "deterministic",
        "label": "3. 재고·수입 원가 조정",
        "sub": [
          "실사·미착·검수·판매 수량 대사",
          "후행 물류비·재고/매출원가 배분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "assets",
      "data": {
        "kind": "deterministic",
        "label": "3. 자산·기간 귀속 조정",
        "sub": [
          "감가상각·선급 상각·미지급비용",
          "매출 귀속·자산 처분·충당 검토"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "fx",
      "data": {
        "kind": "deterministic",
        "label": "3. 외화·차입금 잔액 평가",
        "sub": [
          "외화채권·채무 / 적용 환율 확인",
          "실현·미실현 환차 / 이자 검토"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "adjust",
      "data": {
        "kind": "verify",
        "label": "4. 결산 전표 검토·확정",
        "sub": [
          "근거·계산·차대·귀속 검증",
          "원장·보조부 함께 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "trial",
      "data": {
        "kind": "verify",
        "label": "5. 합계잔액시산표 검증",
        "sub": [
          "계정 잔액·차대 합계·연결 검증",
          "장부와 보조부 불일치 재확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "draft",
      "data": {
        "kind": "deterministic",
        "label": "6. 재무제표·세무 자료 작성",
        "sub": [
          "재무상태·손익·현금흐름·자본",
          "적용 기준별 주석·명세 작성"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "tax",
      "data": {
        "kind": "deterministic",
        "label": "7. 세무조정 결과 반영",
        "sub": [
          "법인세 상세 흐름에서 세액 검토",
          "세금비용·부채 등 결산 전표 보완"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "final",
      "data": {
        "kind": "gate",
        "label": "8. 최종 결산 승인·마감",
        "sub": [
          "책임자: 재무제표·명세 확정",
          "수정 권한·재개방 이력 관리"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "carry",
      "data": {
        "kind": "activate",
        "label": "9. 다음 기간 이월",
        "sub": [
          "기초잔액 ↔ 보조부 이어받기",
          "확정 자료·신고 근거 보존"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "correction",
      "data": {
        "kind": "gate",
        "label": "불일치·마감 후 정정",
        "sub": [
          "원인 전표·원천 자료 추적",
          "재개방/수정 기간·신고 영향 검토"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "cutoff-balances",
      "source": "cutoff",
      "target": "balances",
      "kind": "impl"
    },
    {
      "id": "balances-stock",
      "source": "balances",
      "target": "stock",
      "kind": "impl"
    },
    {
      "id": "balances-assets",
      "source": "balances",
      "target": "assets",
      "kind": "impl"
    },
    {
      "id": "balances-fx",
      "source": "balances",
      "target": "fx",
      "kind": "impl"
    },
    {
      "id": "stock-adjust",
      "source": "stock",
      "target": "adjust",
      "kind": "impl"
    },
    {
      "id": "assets-adjust",
      "source": "assets",
      "target": "adjust",
      "kind": "impl"
    },
    {
      "id": "fx-adjust",
      "source": "fx",
      "target": "adjust",
      "kind": "impl"
    },
    {
      "id": "adjust-trial",
      "source": "adjust",
      "target": "trial",
      "kind": "impl"
    },
    {
      "id": "trial-draft",
      "source": "trial",
      "target": "draft",
      "kind": "impl",
      "label": "검증 통과"
    },
    {
      "id": "trial-correction",
      "source": "trial",
      "target": "correction",
      "kind": "impl",
      "label": "차이 발생"
    },
    {
      "id": "correction-adjust",
      "source": "correction",
      "target": "adjust",
      "kind": "ref",
      "label": "수정·재검증",
      "tone": "verify"
    },
    {
      "id": "draft-tax",
      "source": "draft",
      "target": "tax",
      "kind": "impl"
    },
    {
      "id": "tax-final",
      "source": "tax",
      "target": "final",
      "kind": "impl"
    },
    {
      "id": "final-carry",
      "source": "final",
      "target": "carry",
      "kind": "impl"
    }
  ],
  "groups": [
    {
      "id": "workflow",
      "label": "업무 흐름 · 담당자와 회계 연결"
    }
  ]
};
