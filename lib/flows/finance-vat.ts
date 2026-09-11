import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-vat",
  "title": "08. 부가세 신고·납부·환급",
  "description": "매출·매입·수입 증빙 → 과세·공제 검토 → 신고서 → 접수 → 납부·환급",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "부가가치세 신고는 기중 세목별 주기로 진행하며 연말 결산 완료를 기다리지 않습니다. 티앤에스의 국내 매출·매입, 고객 카드 매출, 수입 증빙과 운영비 자료를 연결하는 확장 설계입니다.",
    "매출세액과 공제 가능한 매입세액을 대사합니다. 카드 매출과 계산서 중복, 공제/불공제, 면세·영세율, 사업장 귀속, 수정증빙과 신고기간을 담당자가 확인합니다. 구체 세율·기한·공제 요건은 신고 대상 시점의 기준으로 적용합니다.",
    "수입신고·수입세금계산서의 부가세는 관세·운임 등 원가와 분리해 검토합니다. 매입세액 공제는 증빙을 수집했다는 이유만으로 자동 확정하지 않습니다.",
    "전표·증빙 합계와 신고서·부속명세를 대사하고 신고 담당자 또는 세무 검토자가 확정합니다. 카드사 정산액은 수수료 차감 후 입금액이므로 이를 카드 매출액으로 대신 사용하지 않습니다.",
    "홈택스 제출은 직접 연동 지원 여부 또는 신고파일·외부 신고도구 경로를 별도 확정합니다. 접수 확인과 납부·환급 완료를 구분하고 실패·반려·수정신고·경정청구를 원 신고와 연결합니다. 계산서 전송은 세무신고 제출과 별개입니다."
  ],
  "nodes": [
    {
      "id": "period",
      "data": {
        "kind": "entry",
        "label": "1. 신고 사업장·기간 선택",
        "sub": [
          "회계: 과세 유형·대상 기간 확인",
          "기신고 자료·수정 내역 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "sales",
      "data": {
        "kind": "deterministic",
        "label": "2. 매출 증빙 집계",
        "sub": [
          "계산서·현금영수증·카드 매출",
          "카드 승인/취소 · 중복 매출 제외"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "purchases",
      "data": {
        "kind": "deterministic",
        "label": "2. 매입·수입 증빙 집계",
        "sub": [
          "국내 매입·운영비·회사 카드",
          "수입계산서·수정 증빙 연결"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "taxclass",
      "data": {
        "kind": "verify",
        "label": "3. 과세·공제 여부 검토",
        "sub": [
          "과세·면세·영세율 / 공제·불공제",
          "기간·사업장·누락·중복 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "fix",
      "data": {
        "kind": "gate",
        "label": "증빙·전표 보완",
        "sub": [
          "세금 구분 오류·누락 증빙 확인",
          "원거래 수정·재집계"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "calc",
      "data": {
        "kind": "deterministic",
        "label": "4. 세액·신고서·명세 작성",
        "sub": [
          "매출세액·공제세액 등 산정",
          "부속명세 ↔ 장부 합계 대사"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "approve",
      "data": {
        "kind": "gate",
        "label": "5. 신고자료 최종 검토",
        "sub": [
          "회계담당자·세무 검토자",
          "신고서 버전·근거 확정"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "submit",
      "data": {
        "kind": "deterministic",
        "label": "6. 홈택스 신고 제출",
        "sub": [
          "확정된 제출 경로로 전송/업로드",
          "응답 미확인 시 접수 결과 조회"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "receipt",
      "data": {
        "kind": "verify",
        "label": "7. 접수 결과 확인",
        "sub": [
          "접수증·신고금액·상태 보관",
          "반려·오류는 보완 후 재제출"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "pay",
      "data": {
        "kind": "activate",
        "label": "8. 납부·환급 대사",
        "sub": [
          "납부서 ↔ 은행 출금 / 환급 입금",
          "세금 잔액·전표·현금흐름 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "amend",
      "data": {
        "kind": "gate",
        "label": "수정신고·경정청구 검토",
        "sub": [
          "누락·반품·세액 오류 발생",
          "원 신고와 변경 근거·차액 연결"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "period-sales",
      "source": "period",
      "target": "sales",
      "kind": "impl"
    },
    {
      "id": "period-purchases",
      "source": "period",
      "target": "purchases",
      "kind": "impl"
    },
    {
      "id": "sales-taxclass",
      "source": "sales",
      "target": "taxclass",
      "kind": "impl"
    },
    {
      "id": "purchases-taxclass",
      "source": "purchases",
      "target": "taxclass",
      "kind": "impl"
    },
    {
      "id": "taxclass-fix",
      "source": "taxclass",
      "target": "fix",
      "kind": "impl",
      "label": "보완"
    },
    {
      "id": "fix-calc",
      "source": "fix",
      "target": "calc",
      "kind": "impl",
      "label": "재검토 완료"
    },
    {
      "id": "taxclass-calc",
      "source": "taxclass",
      "target": "calc",
      "kind": "impl",
      "label": "검토 완료"
    },
    {
      "id": "calc-approve",
      "source": "calc",
      "target": "approve",
      "kind": "impl"
    },
    {
      "id": "approve-submit",
      "source": "approve",
      "target": "submit",
      "kind": "impl"
    },
    {
      "id": "submit-receipt",
      "source": "submit",
      "target": "receipt",
      "kind": "impl"
    },
    {
      "id": "receipt-approve",
      "source": "receipt",
      "target": "approve",
      "kind": "ref",
      "label": "반려·보완",
      "tone": "verify"
    },
    {
      "id": "receipt-pay",
      "source": "receipt",
      "target": "pay",
      "kind": "impl",
      "label": "접수 확인"
    },
    {
      "id": "pay-amend",
      "source": "pay",
      "target": "amend",
      "kind": "impl",
      "label": "사후 수정 필요"
    },
    {
      "id": "amend-calc",
      "source": "amend",
      "target": "calc",
      "kind": "ref",
      "label": "수정 자료",
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
