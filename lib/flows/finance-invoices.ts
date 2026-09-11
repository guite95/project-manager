import type { FlowChart } from "@/components/flow/types";

// 근거와 현행/확장 경계: docs/flows/tns-finance-details.md
export const chart: FlowChart = {
  "slug": "finance-invoices",
  "title": "05. 계산서·불일치·연동 복구",
  "description": "발행·수취 → 원거래 대사 → 예외 조치 → 전송 상태 확인 → 회계·신고 연결",
  "caption": "티앤에스 업무 참고 · 전체 회계 확장 설계안",
  "direction": "LR",
  "nodeWidth": 250,
  "howToRead": [
    "현행 계산서 발행·매입 매칭과 수집 로직을 참고한 확장안입니다. 현행 소스에는 Poooling의 은행거래·계산서·카드 승인 수집 경로도 있으므로, 팝빌 요청 범위와 실제 수집 경로의 통합 방식은 구현 전 확정합니다.",
    "출고완료 후 미발행, 발행 후 미출고, 품목·수량·금액 불일치를 각각 탐지하고 담당자·사유·조치·처리 상태를 추적합니다. 선발행 등의 정당한 예외는 근거를 남겨 관리하며 법정 발급 시점과 현행 전량 출고 가드의 조정은 별도 검토합니다.",
    "매출 발행은 팝빌·홈택스 전송 상태를 확인하고, 매입 수취는 조회 결과를 원거래와 연결합니다. 카드 증빙·세금계산서가 같은 거래를 나타내는지 확인해 매출·매입세액을 중복 반영하지 않습니다.",
    "전송 실패나 응답 유실은 기존 발행·접수 결과부터 조회합니다. 복구 후 미반영 건만 재시도하고 업무키·외부 문서 식별자로 중복을 막습니다. 한도·자격·내용 오류 등 자동 복구 불가 건은 담당자 조치 대기로 남깁니다.",
    "수정·취소는 원 계산서·반품·전표와 연결해 상태와 이력을 유지합니다. 팝빌 계정 가입·API 비용은 고객 부담이며, 계산서 전송 성공은 부가세·법인세 신고 완료를 뜻하지 않습니다."
  ],
  "nodes": [
    {
      "id": "sales",
      "data": {
        "kind": "entry",
        "label": "1. 매출 증빙 대상",
        "sub": [
          "영업·회계: 거래·출고·인도 내역",
          "발급 시점·카드 증빙 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "purchase",
      "data": {
        "kind": "entry",
        "label": "1. 매입 증빙 수취",
        "sub": [
          "국내 구매·수입·운영비 자료",
          "계산서·영수증·카드 증빙"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "match",
      "data": {
        "kind": "verify",
        "label": "2. 원거래·증빙 자동 대사",
        "sub": [
          "거래처·품목·수량·금액·세액",
          "중복 증빙·누락 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "missing",
      "data": {
        "kind": "gate",
        "label": "미발행 / 미출고",
        "sub": [
          "출고완료·미발행 또는 발행·미출고",
          "담당자·발급/출고 예정 추적"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "difference",
      "data": {
        "kind": "gate",
        "label": "수량·금액·품목 불일치",
        "sub": [
          "발주·출고·계산서 차이 확인",
          "반품·단가 변경·중복 여부"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "resolve",
      "data": {
        "kind": "verify",
        "label": "3. 담당자 조치 · 재대사",
        "sub": [
          "영업·구매·회계: 근거 보완",
          "예외 인정·수정·처리 완료 확인"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "route",
      "data": {
        "kind": "deterministic",
        "label": "4. 발행 / 수취 경로 처리",
        "sub": [
          "매출: 발행 요청·홈택스 전송",
          "매입: 수취 자료·조회 상태 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "state",
      "data": {
        "kind": "verify",
        "label": "5. 외부 처리 결과 조회",
        "sub": [
          "발행·전송·접수·오류 상태 구분",
          "원거래·외부 문서와 연결"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "retry",
      "data": {
        "kind": "gate",
        "label": "장애 · 응답 유실 복구",
        "sub": [
          "대기 기록 → 기존 처리 결과 조회",
          "복구 후 미반영 건만 재동기화"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "manual",
      "data": {
        "kind": "failure",
        "label": "자동 복구 불가 · 담당자 조치",
        "sub": [
          "내용·자격·반복 오류 확인",
          "수정 후 재검증 / 실패 이력"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "ledger",
      "data": {
        "kind": "activate",
        "label": "6. 전표·세무 자료 반영",
        "sub": [
          "원거래의 기존 전표와 대사",
          "중복 분개 없이 상태·차이 반영"
        ]
      },
      "group": "workflow"
    },
    {
      "id": "amend",
      "data": {
        "kind": "gate",
        "label": "수정·취소 증빙 연결",
        "sub": [
          "반품·취소 사유 / 원본 관계 보존",
          "정정 전표·신고 영향 재확인"
        ]
      },
      "group": "workflow"
    }
  ],
  "edges": [
    {
      "id": "sales-match",
      "source": "sales",
      "target": "match",
      "kind": "impl"
    },
    {
      "id": "purchase-match",
      "source": "purchase",
      "target": "match",
      "kind": "impl"
    },
    {
      "id": "match-missing",
      "source": "match",
      "target": "missing",
      "kind": "impl",
      "label": "시점 불일치"
    },
    {
      "id": "match-difference",
      "source": "match",
      "target": "difference",
      "kind": "impl",
      "label": "내용 불일치"
    },
    {
      "id": "missing-resolve",
      "source": "missing",
      "target": "resolve",
      "kind": "impl"
    },
    {
      "id": "difference-resolve",
      "source": "difference",
      "target": "resolve",
      "kind": "impl"
    },
    {
      "id": "match-route",
      "source": "match",
      "target": "route",
      "kind": "impl",
      "label": "정상"
    },
    {
      "id": "resolve-route",
      "source": "resolve",
      "target": "route",
      "kind": "impl",
      "label": "재검증 완료"
    },
    {
      "id": "route-state",
      "source": "route",
      "target": "state",
      "kind": "impl"
    },
    {
      "id": "state-ledger",
      "source": "state",
      "target": "ledger",
      "kind": "impl",
      "label": "결과 확인"
    },
    {
      "id": "state-retry",
      "source": "state",
      "target": "retry",
      "kind": "impl",
      "label": "장애·미확인"
    },
    {
      "id": "retry-ledger",
      "source": "retry",
      "target": "ledger",
      "kind": "impl",
      "label": "처리 확인·재시도 성공"
    },
    {
      "id": "retry-manual",
      "source": "retry",
      "target": "manual",
      "kind": "impl",
      "label": "복구 불가"
    },
    {
      "id": "manual-state",
      "source": "manual",
      "target": "state",
      "kind": "ref",
      "label": "보완 후 재조회",
      "tone": "verify"
    },
    {
      "id": "ledger-amend",
      "source": "ledger",
      "target": "amend",
      "kind": "impl",
      "label": "수정 사유 발생"
    },
    {
      "id": "amend-match",
      "source": "amend",
      "target": "match",
      "kind": "ref",
      "label": "원거래 재대사",
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
