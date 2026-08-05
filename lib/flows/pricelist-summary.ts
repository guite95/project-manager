import type { FlowChart } from "@/components/flow/types";

/* -------------------------------------------------------------------------
 * 가격표 자동 적재 — 요약 흐름. **설명용 한 장.**
 *
 * 전체 흐름(42박스)·워커 상세(56박스)는 구현 명세로는 맞지만 그걸 띄워놓고
 * 말로 설명하기는 어렵다. 그래서 "가격표 한 건이 무슨 일을 겪는가"만 남긴
 * 15박스짜리를 따로 뒀다. 두 상세 차트는 손대지 않는다.
 *
 * 세로 단수가 곧 글자 크기다(화면 높이에 맞춰 축소되므로). 그래서 갈라지지
 * 않는 이웃 단계는 한 박스로 합쳤다 — 업로드+배치, 활성화+마스터.
 *
 * 남길 것과 접을 것의 기준:
 *  - 남긴다: 흐름이 **갈라지는 지점**과 **사람이 개입하는 지점**.
 *    설명할 때 질문이 나오는 곳이 거기다.
 *  - 접는다: 한 갈래로만 흐르는 내부 단계. 프로파일링·지문·플래너·샤딩·
 *    Axis Role·V1~V9 같은 것들은 상위 박스 한 줄로 줄였다.
 *
 * 그래서 이 차트에 남은 분기는 넷뿐이다.
 *  1. 아는 구조냐 (KNOWN → 바로 추출 / 신규·변경 → 온보딩)
 *  2. 검증을 통과했냐 (Tier 1·2 자동 / Tier 3 격리)
 *  3. 실패·반려를 어디로 되돌리냐 (구조 / 판독 / 조립)
 *  4. 더는 못 고치냐 (원천자료 부족 · 반려 확정)
 *
 * 사람이 나오는 자리도 딱 둘이다 — 신규 구조를 **추출 전에** 한 번,
 * 격리된 범위를 **활성화 전에** 한 번. 이 두 개가 이 그림의 요점이다.
 *
 * 복구는 박스 하나로 접었다. "실패하면 원인에 따라 되돌아갈 지점이 다르다"만
 * 보이면 되고, reason code 표와 무효화 DAG 는 상세 차트가 갖는다.
 * ---------------------------------------------------------------------- */

export const pricelistSummary: FlowChart = {
  slug: "pricelist-summary",
  title: "가격표 자동 적재 — 요약 흐름",
  description: "설명용 한 장. 가격표 파일 한 건이 ACTIVE 마스터까지 가는 길",
  caption: "요약 흐름 — 상세는 «전체 흐름» · «워커 상세» 차트",
  direction: "TB",
  nodeWidth: 230,

  howToRead: [
    "가격표 파일 한 건이 업로드부터 ACTIVE 마스터까지 가는 길만 남긴 설명용 요약입니다. 구현 상세는 «전체 흐름»·«워커 상세» 차트에 있습니다.",
    "분기는 넷뿐입니다 — 아는 구조인가, 검증을 통과했나, 실패를 어디로 되돌리나, 더는 못 고치나.",
    "사람이 개입하는 자리는 둘입니다 — 신규 구조를 추출 전에 확인할 때, 격리된 범위를 활성화 전에 검토할 때.",
    "실패·반려는 버리지 않고 복구 박스에서 원인별로 가장 가까운 단계로 되돌립니다. 원천자료 부족·반려 확정만 보류로 남습니다.",
  ],

  nodes: [
    {
      id: "upload",
      data: {
        kind: "entry",
        label: "가격표 업로드 · 배치 생성",
        sub: [
          "가격 담당자가 PDF · XLSX 올림",
          "같은 파일은 다시 처리하지 않음",
          "원본은 그대로 보관",
        ],
      },
    },
    {
      id: "read",
      data: {
        kind: "model",
        label: "문서 판독",
        sub: ["렌더 · OCR · AI 문서 지도", "어느 페이지에 무엇이 있는지"],
      },
    },
    {
      id: "route",
      data: {
        kind: "gate",
        label: "브랜드 구조 판정",
        sub: ["등록된 어댑터와 대조", "아는 구조인가 / 바뀌었나 / 처음인가"],
      },
    },
    {
      id: "onboard",
      data: {
        kind: "activate",
        label: "신규 · 변경 구조 온보딩",
        sub: [
          "구조 카드 → 대표 섹션 파일럿",
          "사람은 구조만 최소 확인",
          "전체 추출은 그 다음",
        ],
      },
    },
    {
      id: "extract",
      data: {
        kind: "model",
        label: "가격 정보 추출",
        sub: ["표 · 제품 블록 단위로 판독", "값 + 근거 좌표를 함께 남김"],
      },
    },
    {
      id: "assemble",
      data: {
        kind: "deterministic",
        label: "SKU · 가격 · 관계 조립",
        sub: ["조립은 코드가 결정론적으로", "없는 조합을 만들어내지 않음"],
      },
    },
    {
      id: "verify",
      data: {
        kind: "verify",
        label: "검증 · 독립 감사",
        sub: ["기계 검증 V1~V9", "다른 모델이 한 번 더 감사"],
        doc: "AUDIT-PASS",
      },
    },
    {
      id: "gate",
      data: {
        kind: "gate",
        label: "위험도 게이트",
        sub: ["확실한 범위와 불확실한 범위를 가름"],
      },
    },
    {
      id: "auto",
      data: {
        kind: "activate",
        label: "Tier 1 · 2 — 자동 확정",
        sub: ["검증 전부 통과한 범위", "Tier 2 는 반영 후 감시"],
      },
    },
    {
      id: "quarantine",
      data: {
        kind: "gate",
        label: "Tier 3 — 격리 · 사람 검토",
        sub: ["불확실한 범위만 묶어서 격리", "나머지는 계속 자동 처리"],
      },
    },
    {
      id: "recover",
      data: {
        kind: "gate",
        label: "복구 — 원인별로 되돌림",
        sub: [
          "원인을 분류해 가장 가까운 단계로",
          "영향 범위와 그 아래 결과만 무효화",
          "고치면 검증부터 다시 돈다",
        ],
      },
    },
    {
      id: "hold",
      data: {
        kind: "failure",
        label: "실패 · 보류",
        sub: ["기술 실패 · 원천자료 부족 · 반려", "운영에는 반영되지 않음"],
      },
    },
    {
      id: "master",
      data: {
        kind: "activate",
        label: "활성화 → ACTIVE 가격 마스터",
        sub: [
          "감사 통과분만 반영 · 실패하면 되돌림",
          "에디션 전환 · 발효일",
        ],
      },
    },
    {
      id: "consume",
      data: {
        kind: "activate",
        label: "견적 · 발주 · 원가",
        sub: ["격리된 항목은 사용 차단"],
      },
    },
    {
      id: "learn",
      data: {
        kind: "activate",
        label: "학습 환류",
        sub: ["확정 사례 → 어댑터 · 공통 코어", "다음 배치의 자동 처리율이 오름"],
      },
    },
  ],

  edges: [
    { id: "a2", source: "upload", target: "read", kind: "impl", tone: "entry" },
    { id: "a3", source: "read", target: "route", kind: "impl", tone: "model" },

    /* 분기 1 — 아는 구조인가 */
    { id: "a4", source: "route", target: "extract", kind: "impl", tone: "activate", label: "아는 구조" },
    { id: "a5", source: "route", target: "onboard", kind: "impl", tone: "gate", label: "신규 · 변경" },
    { id: "a6", source: "onboard", target: "extract", kind: "impl", tone: "activate", label: "구조 확정 후" },

    { id: "a7", source: "extract", target: "assemble", kind: "impl", tone: "model" },
    { id: "a8", source: "assemble", target: "verify", kind: "impl", tone: "deterministic" },
    { id: "a9", source: "verify", target: "gate", kind: "impl", tone: "verify" },

    /* 분기 2 — 검증을 통과했나 */
    { id: "a10", source: "gate", target: "auto", kind: "impl", tone: "activate", label: "Tier 1 · 2" },
    { id: "a11", source: "gate", target: "quarantine", kind: "impl", tone: "gate", label: "Tier 3" },

    /* 분기 3 — 실패·반려는 버리는 게 아니라 되돌린다.
     * 되돌아갈 지점이 원인마다 다르다는 것이 이 세 개의 점선이다. */
    { id: "a12", source: "extract", target: "recover", kind: "impl", tone: "failure", label: "판독 실패" },
    { id: "a13", source: "verify", target: "recover", kind: "impl", tone: "failure", label: "검증 실패" },
    { id: "a14", source: "quarantine", target: "recover", kind: "impl", tone: "gate", label: "수정 · 반려" },
    { id: "a15", source: "recover", target: "route", kind: "ref", tone: "gate", label: "구조가 바뀐 경우" },
    { id: "a15b", source: "recover", target: "extract", kind: "ref", tone: "model", label: "판독 오류" },
    { id: "a15c", source: "recover", target: "assemble", kind: "ref", tone: "deterministic", label: "값 · 조합 확정" },

    /* 분기 4 — 더는 못 고치는 것만 남는다 */
    { id: "a15d", source: "recover", target: "hold", kind: "impl", tone: "failure", label: "원천자료 부족 · 반려 확정" },

    /* 활성화 */
    { id: "a16", source: "auto", target: "master", kind: "impl", tone: "activate" },
    { id: "a18", source: "master", target: "consume", kind: "impl", tone: "activate" },

    /* 학습 — 이번에 사람이 확정한 것은 다음 배치에서 자동으로 처리된다 */
    { id: "a19", source: "quarantine", target: "learn", kind: "impl", tone: "activate", label: "확정 사례" },
    { id: "a20", source: "onboard", target: "learn", kind: "ref", tone: "activate", label: "새 어댑터" },
    { id: "a21", source: "learn", target: "route", kind: "ref", tone: "activate", label: "다음 배치는 아는 구조" },
  ],
};
