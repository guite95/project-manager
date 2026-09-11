import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-corporate-tax",
  "title": "10. 법인세·지방소득세·사후관리",
  "description": "결산 초안 → 세무조정 → 세액·신고서 검토 → 재무제표 확정 → 신고·납부",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "전체 회계 확장 설계입니다. 결산 장부를 바탕으로 세무조정과 법인세·법인지방소득세 신고서·부속서류를 작성하고 검토·제출·접수·납부·사후관리까지 연결합니다.",
    "회계 손익과 세법상 소득은 다를 수 있으므로 익금·손금 조정과 소득처분·이월 항목, 공제·감면·기납부세액 등을 검토합니다. 적용 항목과 외부 세무조정 등 필요한 검토 체계는 회사의 대상 요건에 맞춰 확정합니다.",
    "티앤에스의 재고·수입 원가·감가상각·차량/경비·이자비용 자료가 결산·세무 검토의 입력입니다. 각 항목의 손금/공제 여부를 계정명만으로 단정하지 않고 계약·증빙·사용 목적을 확인합니다.",
    "계산된 세액과 필요한 세금비용·부채 등 조정을 결산 전표에 반영한 뒤 최종 재무제표·신고 자료를 대사합니다. 결산 세금비용이 바뀌어도 신고 기초와 조정표가 일관되는지 최종 확인합니다.",
    "법인세는 홈택스, 법인지방소득세는 해당 지방세 신고 경로로 관리합니다. 직접 전자신고 API가 있다고 가정하지 않고 신고파일/외부 신고도구 연계를 포함해 제출 경로를 확정합니다. 팝빌 계산서 전송과는 별개입니다.",
    "세목별 접수와 실제 납부·환급을 각각 확인하고 잔액을 장부에 반영합니다. 중간예납 등 기중 의무는 별도 일정으로 관리하며 연말 신고가 끝나야 시작되는 것으로 보지 않습니다. 사후 오류는 수정신고·경정청구와 관련 전표·차액으로 연결합니다."
  ],
  "nodes": [
    {
      "id": "closing",
      "data": {
        "kind": "entry",
        "label": "1. 결산 장부·명세 수집",
        "sub": [
          "회계: 시산표·재무제표 초안",
          "재고·자산·차입·세금 잔액"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "adjust",
      "data": {
        "kind": "verify",
        "label": "2. 회계·세법 차이 검토",
        "sub": [
          "익금·손금 조정 / 소득처분",
          "감가상각·경비·이자 등 근거 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "calc",
      "data": {
        "kind": "deterministic",
        "label": "3. 과세표준·세액 계산",
        "sub": [
          "이월 항목·공제·감면·기납부세액",
          "법인세·지방소득세 구분"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "review",
      "data": {
        "kind": "gate",
        "label": "4. 세무조정·신고 검토",
        "sub": [
          "회계담당자·세무 검토자",
          "조정표·신고서·부속서류 대사"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "final",
      "data": {
        "kind": "verify",
        "label": "5. 결산 세금 반영·최종 확정",
        "sub": [
          "필요한 세금비용·부채 전표 반영",
          "재무제표·신고서 최종 일치 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "national",
      "data": {
        "kind": "deterministic",
        "label": "6. 법인세 신고 제출",
        "sub": [
          "홈택스 · 확정된 신고 경로",
          "신고서·부속명세·접수 결과"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "local",
      "data": {
        "kind": "deterministic",
        "label": "6. 법인지방소득세 신고",
        "sub": [
          "위택스 등 지방세 신고 경로",
          "사업장별 대상·안분 검토"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "receipt",
      "data": {
        "kind": "verify",
        "label": "7. 세목별 접수 확인",
        "sub": [
          "접수증·버전·신고금액 보존",
          "한 세목 접수로 전체 완료 금지"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "pay",
      "data": {
        "kind": "deterministic",
        "label": "8. 납부·환급·세금 잔액 대사",
        "sub": [
          "신고세액 ↔ 실제 출금·환급",
          "미지급세금·선납세금 정리"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "archive",
      "data": {
        "kind": "activate",
        "label": "9. 신고 근거·기한 관리",
        "sub": [
          "원장·명세·접수증·납부증 보관",
          "중간예납 등 다음 의무 일정"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "fix",
      "data": {
        "kind": "gate",
        "label": "반려·오류 · 수정신고/경정청구",
        "sub": [
          "원 신고·원장·조정표 영향 확인",
          "재검토·차액 납부/환급 추적"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "closing-adjust",
      "source": "closing",
      "target": "adjust",
      "kind": "impl"
    },
    {
      "id": "adjust-calc",
      "source": "adjust",
      "target": "calc",
      "kind": "impl"
    },
    {
      "id": "calc-review",
      "source": "calc",
      "target": "review",
      "kind": "impl"
    },
    {
      "id": "review-final",
      "source": "review",
      "target": "final",
      "kind": "impl"
    },
    {
      "id": "final-national",
      "source": "final",
      "target": "national",
      "kind": "impl"
    },
    {
      "id": "final-local",
      "source": "final",
      "target": "local",
      "kind": "impl"
    },
    {
      "id": "national-receipt",
      "source": "national",
      "target": "receipt",
      "kind": "impl"
    },
    {
      "id": "local-receipt",
      "source": "local",
      "target": "receipt",
      "kind": "impl"
    },
    {
      "id": "receipt-pay",
      "source": "receipt",
      "target": "pay",
      "kind": "impl",
      "label": "접수 확인"
    },
    {
      "id": "pay-archive",
      "source": "pay",
      "target": "archive",
      "kind": "impl"
    },
    {
      "id": "receipt-fix",
      "source": "receipt",
      "target": "fix",
      "kind": "impl",
      "label": "반려·오류"
    },
    {
      "id": "archive-fix",
      "source": "archive",
      "target": "fix",
      "kind": "impl",
      "label": "사후 수정 사유"
    },
    {
      "id": "fix-review",
      "source": "fix",
      "target": "review",
      "kind": "ref",
      "label": "변경분 재검토",
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
