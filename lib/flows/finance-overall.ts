import type { FlowChart } from "@/components/flow/types";

// 전체 회계·세무 처리의 범위 검토안. 구현 완료나 전자신고 API 지원을 뜻하지 않는다.
export const financeOverall: FlowChart = {
  slug: "finance-overall",
  title: "회계·재무 — 전체 흐름",
  description: "회사 전체 거래 → 전표·장부 → 자금 관리 → 결산·재무제표 → 세무조정 → 신고·납부",
  caption: "범위 확장 검토안 · 가로 흐름 / 기중 신고는 연말 결산과 병행",
  direction: "LR",
  groupDirection: "LR",
  nodeWidth: 270,

  howToRead: [
    "업무별 상세는 회계·재무 카테고리의 01~10 차트에서 확인합니다. 영업·국내 구매·해외 수입·운영비의 원천 업무부터 계산서·전표·결산·세목별 신고까지 나누어 설명합니다.",
    "회사 전체 회계처리와 세무신고까지 포함한 범위 확장 검토안입니다. 매출·매입뿐 아니라 급여·경비·자산·차입금·자본 거래를 함께 처리하며, 아래 단계는 구현 완료 상태를 뜻하지 않습니다.",
    "회계 기준과 사업장·회계기간, 계정과목·거래처·세금 구분을 설정하고 전기말 잔액을 이월합니다. 이후 업무 증빙과 금융거래를 수집해 복식부기 전표로 연결합니다.",
    "매출 세금계산서 발행·매입 수취와 상태 추적, 팝빌을 통한 홈택스 전송을 포함합니다. 출고완료 후 미발행, 발행 후 미출고, 품목·수량·금액 불일치는 자동 탐지하고 담당자 조치·재대사·처리 이력을 관리합니다.",
    "은행·카드 자동 수집과 계정과목 자동 매핑으로 전표 초안을 만들고, 담당자가 증빙·차변/대변·세금 구분을 검토해 확정하면 분개장·총계정원장·보조부에 반영합니다. 수동·수정 전표도 지원하고 변경 이력을 보존합니다. 카드 매입 거래 클릭 시 상세 모달을 엽니다.",
    "고객 카드결제는 카드사·PG 정산대기금 → 수수료 확인 → 실제 입금으로 관리합니다. 회사 카드 사용은 지급대기 → 카드대금 출금으로 관리합니다. 채권·채무에 수금·지급을 연결해 잔액과 연체를 추적하며, 정산·수수료·납부 결과도 전표와 장부에 반영합니다.",
    "통합 현금흐름 대시보드는 실제 유입·유출·순현금흐름과 입출금 예정을 구분합니다. 카드 결제와 정산 입출금을 중복 집계하지 않고, 회사 계좌 간 내부이체는 전체 현금흐름에서 상계합니다.",
    "월·연말 결산에서 잔액·합계잔액시산표를 검증하고 재고·매출원가, 감가상각, 외화평가, 미수·미지급 및 선급·선수 항목 등을 조정합니다. 결산 전표를 장부에 반영해 재무상태표·손익계산서·현금흐름표 등 적용 회계기준에 필요한 재무제표·주석을 작성하고, 마감·이월과 재개방 이력을 관리합니다.",
    "부가가치세는 매출·매입 세액과 공제·불공제·영세율 등을 검토하고, 원천세·지급명세서·연말정산은 HR의 급여와 소득 지급 자료를 연계합니다. 이 경로는 세목별 주기에 따라 신고하며 연말 결산 완료를 기다리지 않습니다.",
    "법인세는 결산 자료를 바탕으로 회계와 세법의 차이를 세무조정하고 공제·감면·기납부세액 등을 검토해 신고서·부속서류를 작성합니다. 법인지방소득세 등 지방세도 대상에 맞춰 처리하며, 회계담당자·세무 검토자가 최종 확인합니다.",
    "신고서 작성·검토 → 홈택스·위택스 제출 → 접수 결과 확인 → 납부·환급 대사 → 증빙 보관까지 관리합니다. 반려·오류는 보완 후 재제출하고 수정신고·경정청구 이력도 남깁니다. 전자세금계산서 전송과 세무신고 제출은 별개이며, 세목별 직접 연동 또는 신고파일·외부 신고도구 연계 방식은 별도 확정 대상입니다.",
    "팝빌 계정 가입과 API 이용료는 고객사 부담입니다. 은행·카드 갱신 주기는 제공 서비스 조건에 맞춰 확정하며, 팝빌·홈택스 연동 장애 시 대기·실패 상태를 남기고 복구 후 기존 처리 결과를 확인해 중복 없이 자동 재동기화합니다. 고객 카드 매출·정산 자료의 수집 경로도 계약 카드사·PG에 맞춰 확인합니다.",
  ],

  groups: [
    { id: "g-source", label: "1. 회계 기준·거래 수집", kind: "entry" },
    { id: "g-books", label: "2. 전표·장부 처리", kind: "verify" },
    { id: "g-daily", label: "3. 자금·정산 관리", kind: "store" },
    { id: "g-periodic", label: "기중 신고 · 결산과 병행", kind: "verify" },
    { id: "g-close", label: "4. 결산·재무제표", kind: "activate" },
    { id: "g-tax", label: "5. 법인세 세무조정", kind: "verify" },
    { id: "g-file", label: "6. 신고·납부·사후관리", kind: "activate" },
  ],

  nodes: [
    {
      id: "basis",
      group: "g-source",
      data: {
        kind: "store",
        label: "회계 기준 · 기초잔액 설정",
        sub: ["사업장·회계기간·계정과목·세금 구분", "전기 잔액 이월 · 전표 처리 기준"],
      },
    },
    {
      id: "business",
      group: "g-source",
      data: {
        kind: "entry",
        label: "회사 전체 거래 · 증빙 수집",
        sub: [
          "매출·매입·출고 / 수입·통관",
          "급여·경비·자산 / 차입금·자본",
          "세금계산서 발행·수취 · 홈택스 전송",
        ],
      },
    },
    {
      id: "money",
      group: "g-source",
      data: {
        kind: "deterministic",
        label: "은행 · 카드 · 정산 자료 수집",
        sub: [
          "계좌 입출금 / 회사 카드 사용",
          "고객 카드결제 / 카드사·PG 정산",
          "팝빌 연동 · 장애 복구 후 재동기화",
        ],
      },
    },
    {
      id: "books",
      group: "g-books",
      data: {
        kind: "verify",
        label: "증빙 대사 → 전표 확정 → 장부",
        sub: [
          "출고·계산서 불일치 탐지 · 예외 조치",
          "계정 자동 매핑 · 차변/대변 검토",
          "자동·수동 전표 확정 → 원장 반영",
        ],
      },
    },
    {
      id: "funds",
      group: "g-daily",
      data: {
        kind: "store",
        label: "채권·채무 정산 · 현금흐름",
        sub: [
          "수금·지급 / 카드 정산·수수료 반영",
          "잔액·연체 / 유입·유출·순현금흐름",
          "실제·예정 구분 · 내부이체 상계",
        ],
      },
    },
    {
      id: "periodic-tax",
      group: "g-periodic",
      data: {
        kind: "verify",
        label: "기중 세금 계산 · 신고자료 검토",
        sub: [
          "부가세: 매출·매입 세액 / 공제 검토",
          "원천세·지급명세서 / HR 연계 연말정산",
          "대상 지방세 포함 · 담당자 검토",
        ],
        timing: "세목별 신고 주기",
      },
    },
    {
      id: "closing",
      group: "g-close",
      data: {
        kind: "activate",
        label: "결산 조정 · 재무제표 작성",
        sub: [
          "시산표·잔액 / 재고·원가·감가상각",
          "외화평가·기간 귀속 조정 → 결산 전표",
          "재무상태표·손익·현금흐름표 / 마감·이월",
        ],
        timing: "월·연말 결산",
      },
    },
    {
      id: "corporate-tax",
      group: "g-tax",
      data: {
        kind: "verify",
        label: "세무조정 · 법인세 신고서 작성",
        sub: [
          "회계·세법 차이 조정 / 공제·감면 검토",
          "법인세·법인지방소득세 / 부속서류",
          "회계담당자·세무 검토자 최종 확인",
        ],
      },
    },
    {
      id: "filing",
      group: "g-file",
      data: {
        kind: "activate",
        label: "신고 제출 → 접수 확인 → 납부",
        sub: [
          "홈택스·위택스 / 오류 보완·재제출",
          "납부·환급 확인 → 장부·자금 반영",
          "접수증 보관 / 수정신고·경정청구",
        ],
      },
    },
  ],

  edges: [
    { id: "e-basis-books", source: "basis", target: "books", kind: "ref", label: "처리 기준", tone: "store" },
    { id: "e-business-books", source: "business", target: "books", kind: "impl" },
    { id: "e-money-books", source: "money", target: "books", kind: "impl" },
    { id: "e-books-funds", source: "books", target: "funds", kind: "impl" },
    { id: "e-books-periodic", source: "books", target: "periodic-tax", kind: "impl", label: "증빙·소득 지급 자료", tone: "verify" },
    { id: "e-funds-closing", source: "funds", target: "closing", kind: "impl", label: "장부·잔액 대사" },
    { id: "e-closing-tax", source: "closing", target: "corporate-tax", kind: "impl" },
    { id: "e-tax-filing", source: "corporate-tax", target: "filing", kind: "impl", label: "결산 기반 신고" },
    { id: "e-periodic-filing", source: "periodic-tax", target: "filing", kind: "ref", label: "기중 신고 · 연말 결산과 병행", tone: "verify" },
  ],
};
