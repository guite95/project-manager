import type { FlowChart } from "@/components/flow/types";

/* -------------------------------------------------------------------------
 * 가격표 자동 적재 — 전체 시스템 흐름.
 *
 * 원본(obs_docs/티앤에스/가격표 자동 적재 전체 아키텍처.excalidraw)은 5개 계층을
 * 나란히 세운 **계층도**다. 계층 안의 박스끼리는 연결이 거의 없어서 그대로 옮기면
 * 흐름도로서는 읽히지 않는다(26박스 17연결).
 *
 * 그래서 여기서는 **가격표 파일 한 건이 업로드부터 ACTIVE 마스터까지 가는 여정**을
 * 본선으로 세우고, 계약·모델·저장소·통제·학습은 본선에 붙는 옆 라인으로 재해석했다.
 *
 * 검토 피드백 반영 (1차 그림 대비 바뀐 것):
 *  1. 브랜드 라우팅 뒤에 KNOWN / CHANGED / UNKNOWN 이 실제로 갈라진다.
 *     CHANGED·UNKNOWN 이 곧바로 본 추출로 내려가면 기존 어댑터로 새 표 구조를
 *     억지 해석하는 사고가 재발한다.
 *  2. 신규 구조는 **전체 추출 전에** 파일럿 + 구조 카드 최소 승인을 받는다.
 *     300페이지를 잘못된 grain 으로 뽑은 뒤 Tier 3 에서 발견하면 재처리비가 크다.
 *  3. Tier 3 사람 수정은 검증 면제가 아니다. staging 갱신 → 영향 범위 재조립 →
 *     관련 V 재실행 → 새 dataset_hash → 새 AUDIT-PASS → **게이트 재판정**.
 *  4. "승인 로더" → "제한된 활성화 로더". Tier 1 은 사람 승인 없이 자동 확정이다.
 *  5. 저장소와 관측을 분리. 저장소 카드가 단계별 산출물을 전부 이름으로 갖는다.
 *  6. 모델 실패는 원인별로 갈린다. 기술 오류는 DLQ, 의미 불확실은 격리.
 *  7. 조립 박스를 Axis Role → 유효 조합 → 조립 → Staging 으로 펼쳤다.
 *     카테시안 곱 자동 생성 금지가 이 구간의 핵심 불변식이다.
 *  8. 품목 관계 확정을 별도 박스로 세웠다.
 *  9. 학습 환류를 브랜드 고유 / 범용 결함 두 갈래로 나눴다.
 *     이걸 안 나누면 Inbani 전용 파서로 굳는다.
 * 10. **복구 루프**를 넣었다(3차 피드백). 실패를 DLQ 에 안전하게 보관하는 것과
 *     정확한 적재로 수렴시키는 것은 다르다. 실패·반려는 전부 원인 분류로 모이고,
 *     복귀 지점은 거기서만 정한다 — 원본/구조/판독/조립 중 가장 가까운 단계로.
 *     하위 산출물은 STALE 로 무효화되고, 재검증을 거쳐 새 AUDIT-PASS 를 받는다.
 * 11. 완료를 "실패가 안 보인다"가 아니라 **기계적 종료 조건**으로 판정한다.
 *     원본에 없는 정보는 추측으로 채우지 않고 NEEDS_SOURCE 로 남긴다.
 *
 * 그룹 라벨의 대문자는 워커의 배치 상태 이름이다 — 이 구간은 전부
 * apps/pricelist-worker 안에서 돈다. 각 상태의 **안쪽**은 워커 상세 차트에 있다.
 * ---------------------------------------------------------------------- */

export const pricelistOverall: FlowChart = {
  slug: "pricelist-overall",
  title: "가격표 자동 적재 — 전체 흐름",
  description:
    "업로드 → 구조 판정 → 판독 → 조립 → 검증 → 위험도 게이트 → 활성화 → ACTIVE 마스터",
  caption: "가격표 자동 적재 전체 흐름 · 대문자 그룹 = 워커 배치 상태",
  // 상태 그룹이 7개라 LR 로 늘어놓으면 4:1 로 납작해진다(7200×1660).
  // 배치는 위에서 아래로 상태를 넘어가고, 한 상태 안에서는 좌→우로 처리된다.
  direction: "TB",
  groupDirection: "LR",
  nodeWidth: 250,

  howToRead: [
    "대문자 그룹 라벨은 워커의 배치 상태 이름입니다. 배치는 위에서 아래로 상태를 넘어가고, 한 상태 안에서는 왼쪽에서 오른쪽으로 처리됩니다.",
    "브랜드 라우팅에서 KNOWN / CHANGED / UNKNOWN 이 갈라집니다. 신규·변경 구조는 전체 추출 전에 파일럿과 구조 카드 승인을 먼저 받습니다.",
    "Tier 3 사람 수정은 검증 면제가 아닙니다 — staging 갱신 후 재검증을 거쳐 새 AUDIT-PASS 를 받고 게이트를 재판정합니다.",
    "실패·반려는 전부 복구 루프의 원인 분류로 모이고, 원본/구조/판독/조립 중 가장 가까운 단계로만 되돌아갑니다.",
  ],

  groups: [
    {
      id: "g-read",
      label: "PROFILING · MAPPED — 문서를 읽고 지도를 만든다",
      kind: "entry",
    },
    {
      id: "g-route",
      label: "ROUTED — KNOWN / CHANGED / UNKNOWN 분기",
      kind: "gate",
    },
    {
      id: "g-onboard",
      label: "ONBOARDING — 전체 추출 전에 구조를 확정한다",
      kind: "activate",
    },
    {
      id: "g-extract",
      label: "EXTRACTING — 의미 단위 정밀 추출",
      kind: "model",
    },
    {
      id: "g-assemble",
      label: "ASSEMBLED — 결정론적 조립 → Staging",
      kind: "deterministic",
    },
    {
      id: "g-verify",
      label: "VERIFYING — 기계 검증 + 독립 감사",
      kind: "verify",
    },
    {
      id: "g-gate",
      label: "GATED — 위험도 티어 판정",
      kind: "gate",
    },
    // 복구 노드들은 **그룹으로 묶지 않는다**. 그룹 박스는 Dagre 의 바깥
    // 그래프에서 하나의 랭크를 차지해서, 복구를 본선 밴드 사이에 끼워 넣는다 —
    // 모든 배치가 복구를 지나는 것처럼 읽힌다. 저장소·관측·통제 경계와 마찬가지로
    // 본선 옆에 흩어놓는 편이 "곁가지"라는 성격에 맞는다.
  ],

  nodes: [
    /* ===== 유입 ===== */
    {
      id: "upload",
      data: {
        kind: "entry",
        label: "가격표 업로드",
        sub: ["가격 담당자 · 브랜드 PDF/XLSX"],
      },
    },
    {
      id: "batch",
      data: {
        kind: "entry",
        label: "배치 생성",
        sub: ["source_hash 멱등 · 에디션 후보", "원본은 불변 보관"],
      },
    },
    {
      id: "queue",
      data: {
        kind: "store",
        label: "작업 큐",
        sub: ["stage · attempt · lease", "재시도 예산 · 부분 재개"],
      },
    },

    /* ===== PROFILING · MAPPED ===== */
    {
      id: "profile",
      group: "g-read",
      data: {
        kind: "deterministic",
        label: "프로파일링",
        sub: ["렌더 · OCR · 단어 좌표", "페이지 지문 · 인벤토리"],
      },
    },
    {
      id: "docmap",
      group: "g-read",
      data: {
        kind: "model",
        label: "AI 문서 지도",
        sub: ["섹션 · 표 · 축 후보 판독", "완결성은 코드가 되짚음"],
      },
    },
    {
      id: "compare",
      group: "g-read",
      data: {
        kind: "verify",
        label: "어댑터 · 구조 지문 비교",
        sub: [
          "등록된 지문 ↔ 이번 지도",
          "섹션 · 표별 구조 diff",
          "브랜드 평균으로 뭉개지 않음",
        ],
      },
    },

    /* ===== ROUTED — 피드백 1: 여기가 실제로 갈라진다 ===== */
    {
      id: "known",
      group: "g-route",
      data: {
        kind: "activate",
        label: "KNOWN — 기존 계약 그대로",
        sub: ["계약 · 불변식 일치", "등록 contract 재사용"],
      },
    },
    {
      id: "changed",
      group: "g-route",
      data: {
        kind: "gate",
        label: "CHANGED — 변경 섹션 정찰",
        sub: ["바뀐 섹션 · 표만 다시 읽음", "나머지는 기존 계약 유지"],
      },
    },
    {
      id: "unknown",
      group: "g-route",
      data: {
        kind: "gate",
        label: "UNKNOWN — 신규 브랜드",
        sub: ["신규 브랜드 · 신종 메커니즘", "기존 스키마 억지 매핑 금지"],
      },
    },

    /* ===== ONBOARDING — 피드백 2: 사람 확인을 앞으로 당긴다 ===== */
    {
      id: "card",
      group: "g-onboard",
      data: {
        kind: "model",
        label: "구조 카드 + 기계 검증",
        sub: [
          "모델 grain · 행축 / 열축 의미",
          "마감 vs 가격 밴드 · 환산계수",
          "net / PVP · VAT · 가격 메커니즘",
          "후보는 AI, 완결성은 코드",
        ],
      },
    },
    {
      id: "pilot",
      group: "g-onboard",
      data: {
        kind: "verify",
        label: "대표 파일럿",
        sub: [
          "가장 복잡한 1개 섹션 먼저",
          "원본과 코드 · 셀 · 배치 대사",
          "충돌 0 · 누락 0 후 전수 확대",
        ],
      },
    },
    {
      id: "minhuman",
      group: "g-onboard",
      data: {
        kind: "gate",
        label: "구조 카드 최소 승인",
        sub: [
          "AI 가 근거 · 후보를 제안",
          "사람은 예외만 확인",
          "고객이 메타데이터를 쓰는 게 아님",
          "전수 검토 아님 — 구조만 확정",
        ],
      },
    },
    {
      id: "adapterv",
      group: "g-onboard",
      data: {
        kind: "activate",
        label: "Adapter v1 / vNext",
        sub: [
          "detect · extract 계약 · 불변식",
          "worked examples · fixtures",
          "버전 고정 후 본선 합류",
        ],
      },
    },

    /* ===== EXTRACTING — 피드백 6: 실패 원인별 분기 ===== */
    {
      id: "extract",
      group: "g-extract",
      data: {
        kind: "model",
        label: "의미 단위 정밀 추출",
        sub: ["표 · 제품 블록 · crop 단위", "인쇄값 + 정규화값 + 근거 좌표"],
      },
    },
    {
      id: "reread",
      group: "g-extract",
      data: {
        kind: "gate",
        label: "재판독 · 승격 정책",
        sub: [
          "API 오류 → 동일 shard 재시도",
          "형식 오류 → schema repair 1회",
          "판독 불명확 → crop 확대",
          "구조 불일치 → 상위 모델 승격",
          "같은 호출 반복은 승격이 아님",
        ],
      },
    },

    /* ===== ASSEMBLED — 피드백 7·8: 조립 안쪽을 펼친다 ===== */
    {
      id: "axis",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Axis Role 판정",
        sub: [
          "SKU_IDENTITY / PRICE_SCOPE",
          "CONFIGURATION / DISPLAY_ATTRIBUTE",
          "판정 불가는 UNKNOWN 으로 남김",
          "형상 · 길이 · 마감 = variant axis",
        ],
      },
    },
    {
      id: "combos",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "유효 조합 Resolver",
        sub: [
          "원본에 있거나 명시 허용된 조합만",
          "옵션의 카테시안 곱 자동 생성 금지",
        ],
      },
    },
    {
      id: "build",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "SKU · 가격 · 구성 조립",
        sub: [
          "SKU Materializer",
          "Price Rule Builder",
          "밴드 · 할증 · 수량 티어 = 규칙",
          "Configuration Builder",
        ],
      },
    },
    {
      id: "links",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "품목 관계 확정",
        sub: [
          "각주 · 병기 코드 · 도면 → 후보",
          "필수 부속 · 포함 · 호환 · 대체",
          "source / target / 방향 / 조건",
          "evidence 없으면 채택하지 않음",
        ],
      },
    },
    {
      id: "staging",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Staging 후보",
        sub: [
          "candidate + evidence + lineage",
          "gate_status 미정",
          "운영 마스터 직접 쓰기 없음",
        ],
      },
    },

    /* ===== VERIFYING ===== */
    {
      id: "verify",
      group: "g-verify",
      data: {
        kind: "verify",
        label: "V1~V9 검증",
        sub: ["값 · 커버리지 · 값 오배치", "표 전멸(whole-missing) 탐지"],
      },
    },
    {
      id: "audit",
      group: "g-verify",
      data: {
        kind: "model",
        label: "독립 의미 감사",
        sub: ["추출과 다른 모델 · 공급자", "신규 · 불일치 · 고위험 표만"],
      },
    },
    {
      id: "auditpass",
      group: "g-verify",
      data: {
        kind: "activate",
        label: "AUDIT-PASS + dataset_hash",
        sub: [
          "verdict · findings · blind_spots",
          "audited_by ≠ assembled_by",
          "데이터 바뀌면 자동 실효",
        ],
        doc: "AUDIT-PASS",
      },
    },

    /* ===== GATED ===== */
    {
      id: "gate",
      group: "g-gate",
      data: {
        kind: "gate",
        label: "위험도 게이트",
        sub: ["Tier 1 / 2 / 3 판정", "최소 영향 범위 단위로"],
      },
    },
    {
      id: "tier1",
      group: "g-gate",
      data: {
        kind: "activate",
        label: "Tier 1 — 자동 확정",
        sub: ["KNOWN 구조 · 전 검증 통과", "새 가격 규칙 없음"],
      },
    },
    {
      id: "tier2",
      group: "g-gate",
      data: {
        kind: "verify",
        label: "Tier 2 — 반영 후 감시",
        sub: ["구조 · 가격은 확실", "저위험 속성만 사후 샘플"],
      },
    },
    {
      id: "tier3",
      group: "g-gate",
      data: {
        kind: "gate",
        label: "Tier 3 — 격리",
        sub: [
          "신규 구조 · 교차 불일치",
          "문서 밖 값 · 판독 불가",
          "직접 활성화 불가",
        ],
      },
    },

    /* ===== 피드백 3: 사람 수정은 검증을 건너뛰지 않는다 ===== */
    {
      id: "review",
      data: {
        kind: "entry",
        label: "사람 검토 · 수정",
        sub: [
          "근거 뷰어 · 에디션 Diff",
          "승인자 분리 · 전건 감사 로그",
          "UNKNOWN 을 확정 입력으로 바꾸는 행위",
        ],
      },
    },
    /* ===== 복구 루프 — 실패는 보관이 아니라 되돌림이다 ===== */
    {
      id: "rcls",
      data: {
        kind: "failure",
        label: "실패 · 반려 원인 분류",
        sub: [
          "표준 reason code 로만 기록",
          "기술 / 원본·OCR / 구조 / 조립",
          "검증 / 의미 감사 / 사람 반려",
          "자유 오류 메시지로는 자동 복구 불가",
        ],
      },
    },
    {
      id: "rplan",
      data: {
        kind: "gate",
        label: "복구 계획",
        sub: [
          "returnTo · strategy · maxAttempts",
          "재시도(같은 입력) ≠ 재처리(방법 변경)",
          "AI 는 제안, 복귀 단계는 코드 정책",
          "같은 호출 무한 반복은 복구가 아님",
        ],
      },
    },
    {
      id: "rinval",
      data: {
        kind: "store",
        label: "하위 산출물 무효화",
        sub: [
          "산출물 DAG 아래는 전부 STALE",
          "부분 범위면 그 scope 만",
          "dataset_hash · AUDIT-PASS 자동 실효",
        ],
      },
    },
    {
      id: "recheck",
      data: {
        kind: "verify",
        label: "영향 범위 재조립 · 재검증",
        sub: [
          "덮어쓰지 않고 candidate revision 추가",
          "Axis Role · grain 재판정 포함",
          "영향 범위만 다시 조립 · 관련 V 재실행",
          "새 AUDIT-PASS 없으면 활성화 불가",
        ],
      },
    },
    {
      id: "hold",
      data: {
        kind: "failure",
        label: "미해결 상태 — 원인 명시",
        sub: [
          "NEEDS_INPUT — 문서 밖 값 · 사용자 판단",
          "NEEDS_SOURCE — 원천자료 자체가 없음",
          "REJECTED — 잘못된 후보로 확정",
          "추측으로 채우지 않는다",
        ],
      },
    },
    {
      id: "dlq",
      data: {
        kind: "failure",
        label: "기술 실패 · DLQ",
        sub: [
          "복구 시도 · 예산 한도까지 소진한 것만",
          "PROVIDER · STORAGE · WORKER 오류",
          "의미 불확실은 격리, 구조 변경은 재라우팅",
        ],
      },
    },
    {
      id: "donecheck",
      data: {
        kind: "verify",
        label: "배치 완료 판정",
        sub: [
          "전 페이지 분류 · 표는 추출 또는 명시 제외",
          "커버리지 게이트 · identity 충돌 0",
          "근거 없는 자동 확정 0 · 검증 실패 scope 0",
          "UNKNOWN 0 또는 NEEDS_SOURCE 로 명시",
          "활성화 후 카운트 대사까지 통과",
        ],
      },
    },

    /* ===== 활성화 — 피드백 4 ===== */
    {
      id: "loader",
      data: {
        kind: "activate",
        label: "제한된 활성화 로더",
        sub: [
          "Tier 1 → 자동 활성화",
          "Tier 2 → 활성화 + 감시 플래그",
          "AUDIT-PASS + dataset_hash 대조",
          "신규 브랜드 첫 배치는 별도 승인",
        ],
      },
    },
    {
      id: "master",
      data: {
        kind: "activate",
        label: "ACTIVE 가격 마스터",
        sub: ["에디션 전환 · supersedes · 발효일"],
      },
    },
    {
      id: "consume",
      data: {
        kind: "activate",
        label: "운영 소비",
        sub: ["견적 · 발주 · 원가 계산", "격리분은 사용 차단"],
      },
    },

    /* ===== 옆 라인 — 공급 · 저장 · 관측 · 통제 ===== */
    {
      id: "adapter",
      data: {
        kind: "activate",
        label: "브랜드 어댑터 레지스트리",
        sub: ["detect · extract 계약 · 불변식", "배치마다 버전 고정"],
      },
    },
    {
      id: "models",
      data: {
        kind: "model",
        label: "모델 계층",
        sub: ["저비용: 지도 · 분류", "정밀: 표 · 축 판독", "고난도: 교차 감사"],
      },
    },
    {
      id: "store",
      data: {
        kind: "store",
        label: "저장소",
        sub: [
          "원본 · source_hash",
          "페이지 이미지 · OCR · profile",
          "document-map · crop · 원응답",
          "dataset · verify · AUDIT-PASS",
          "gate · 승인 · 전환 이벤트",
        ],
      },
    },
    {
      id: "observ",
      data: {
        kind: "store",
        label: "관측",
        sub: [
          "로그 · 메트릭 · 트레이스",
          "단계별 비용 · 자동 처리율",
          "격리율 · 알림",
        ],
      },
    },
    {
      id: "boundary",
      data: {
        kind: "gate",
        label: "강제 통제 경계",
        sub: ["워커 계정은 staging 까지만", "ACTIVE 쓰기는 활성화 로더만"],
      },
    },

    /* ===== 학습 루프 — 피드백 9: 두 갈래로 나눈다 ===== */
    {
      id: "learn",
      data: {
        kind: "activate",
        label: "확정 사례 분류",
        sub: [
          "브랜드 고유인가 범용 결함인가",
          "이걸 안 나누면 전용 파서로 굳는다",
        ],
      },
    },
    {
      id: "corefix",
      data: {
        kind: "deterministic",
        label: "Pipeline Core · 공통 스키마",
        sub: [
          "다열 표 헤더 시프트 같은 범용 결함",
          "관계 유형 자체가 부족한 경우",
          "전 브랜드 회귀 테스트 필수",
        ],
      },
    },
    {
      id: "golden",
      data: {
        kind: "verify",
        label: "골든 벤치마크 · CI",
        sub: ["과거 결함 회귀 고정", "모델 교체 전후 동일 평가"],
      },
    },
  ],

  edges: [
    /* 유입 */
    { id: "e1", source: "upload", target: "batch", kind: "impl", tone: "entry" },
    { id: "e2", source: "batch", target: "queue", kind: "impl", tone: "entry" },
    { id: "e3", source: "queue", target: "profile", kind: "impl", tone: "store", label: "비동기 소비" },

    /* PROFILING · MAPPED */
    { id: "e4", source: "profile", target: "docmap", kind: "impl", tone: "deterministic" },
    { id: "e5", source: "docmap", target: "compare", kind: "impl", tone: "model" },
    { id: "e6", source: "adapter", target: "compare", kind: "ref", tone: "activate", label: "계약 · 불변식" },

    /* ROUTED — 3갈래 */
    { id: "e7", source: "compare", target: "known", kind: "impl", tone: "activate", label: "일치" },
    { id: "e8", source: "compare", target: "changed", kind: "impl", tone: "gate", label: "구조 변경" },
    { id: "e9", source: "compare", target: "unknown", kind: "impl", tone: "gate", label: "미등록" },

    /* ONBOARDING
     * CHANGED 는 변경 섹션만 정찰하므로 구조 카드를 새로 쓰지 않고 파일럿부터,
     * UNKNOWN 은 구조 카드 → 파일럿 → 최소 승인을 모두 거친다. */
    { id: "e10", source: "unknown", target: "card", kind: "impl", tone: "gate" },
    { id: "e11", source: "changed", target: "pilot", kind: "impl", tone: "gate", label: "변경분만" },
    { id: "e12", source: "card", target: "pilot", kind: "impl", tone: "model" },
    { id: "e13", source: "pilot", target: "minhuman", kind: "impl", tone: "gate", label: "신규 구조" },
    { id: "e14", source: "minhuman", target: "adapterv", kind: "impl", tone: "activate", label: "구조 확정" },
    { id: "e15", source: "pilot", target: "adapterv", kind: "impl", tone: "activate", label: "CHANGED" },

    /* EXTRACTING */
    { id: "e16", source: "known", target: "extract", kind: "impl", tone: "model", label: "기존 계약 추출" },
    { id: "e17", source: "adapterv", target: "extract", kind: "impl", tone: "model", label: "계약 고정 → 전체 추출" },
    { id: "e18", source: "extract", target: "reread", kind: "impl", tone: "model", label: "실패 · 불명확" },
    // 승격은 되돌아가는 고리라 점선으로 둔다. 실선 두 줄이 마주보면 같은 복도를 탄다.
    { id: "e19", source: "reread", target: "extract", kind: "ref", tone: "gate", label: "문맥 · 모델 승격" },
    // 같은 단계에서 못 푸는 것은 전부 복구 루프가 받는다. 여기서 바로 DLQ 로
    // 보내거나 바로 재라우팅하지 않는다 — 복귀 지점은 한 곳에서 정한다.
    { id: "e20", source: "reread", target: "rcls", kind: "impl", tone: "failure", label: "재시도로 안 되는 것" },

    /* ASSEMBLED */
    { id: "e22", source: "extract", target: "axis", kind: "impl", tone: "deterministic", label: "page JSON + 근거" },
    { id: "e23", source: "axis", target: "combos", kind: "impl", tone: "deterministic" },
    { id: "e24", source: "combos", target: "build", kind: "impl", tone: "deterministic" },
    { id: "e25", source: "axis", target: "links", kind: "impl", tone: "deterministic", label: "SKU 축이 아닌 것" },
    { id: "e26", source: "build", target: "staging", kind: "impl", tone: "deterministic" },
    { id: "e27", source: "links", target: "staging", kind: "impl", tone: "deterministic", label: "item_links 후보" },

    /* VERIFYING */
    { id: "e28", source: "staging", target: "verify", kind: "impl", tone: "verify" },
    { id: "e29", source: "verify", target: "audit", kind: "impl", tone: "model", label: "고위험 표만" },
    { id: "e30", source: "audit", target: "auditpass", kind: "impl", tone: "activate" },

    /* GATED */
    { id: "e31", source: "auditpass", target: "gate", kind: "impl", tone: "gate" },
    { id: "e32", source: "gate", target: "tier1", kind: "impl", tone: "activate", label: "Tier 1" },
    { id: "e33", source: "gate", target: "tier2", kind: "impl", tone: "verify", label: "Tier 2" },
    { id: "e34", source: "gate", target: "tier3", kind: "impl", tone: "gate", label: "Tier 3" },

    { id: "e35", source: "tier3", target: "review", kind: "impl", tone: "gate" },
    { id: "e36", source: "review", target: "rcls", kind: "impl", tone: "gate", label: "수정값 · 반려 사유" },

    /* 복구 루프 — 실패·반려가 전부 여기로 모이고, 여기서만 복귀 지점을 정한다.
     *
     * 나가는 점선 넷이 이 그림의 요점이다. 항상 처음부터 다시 돌리는 게 아니라
     * 원인에 따라 가장 가까운 올바른 단계로 되돌아간다. */
    { id: "v1", source: "verify", target: "rcls", kind: "impl", tone: "failure", label: "검증 실패 scope" },
    { id: "v2", source: "auditpass", target: "rcls", kind: "impl", tone: "failure", label: "감사 반려" },
    { id: "v3", source: "loader", target: "rcls", kind: "impl", tone: "failure", label: "활성화 실패" },
    { id: "v4", source: "rcls", target: "rplan", kind: "impl", tone: "failure" },
    { id: "v5", source: "rplan", target: "rinval", kind: "impl", tone: "gate" },
    { id: "v6", source: "rinval", target: "recheck", kind: "impl", tone: "verify", label: "재조립 · 재검증만" },
    { id: "v7", source: "recheck", target: "gate", kind: "impl", tone: "verify", label: "새 AUDIT-PASS → 재판정" },
    { id: "v8", source: "rinval", target: "profile", kind: "ref", tone: "deterministic", label: "원본 · OCR 오류" },
    { id: "v9", source: "rinval", target: "changed", kind: "ref", tone: "gate", label: "CONTRACT_MISMATCH" },
    { id: "v10", source: "rinval", target: "extract", kind: "ref", tone: "model", label: "판독 · 열 오류" },
    // 조립 정책·grain 재판정은 별도 선을 긋지 않고 재조립 단계가 흡수한다.
    // rinval → axis 를 그리면 dagre 가 복구 그룹을 EXTRACTING 과 ASSEMBLED
    // **사이**에 끼워 넣어서, 복구가 본선 단계처럼 읽힌다.
    { id: "v12", source: "rplan", target: "dlq", kind: "impl", tone: "failure", label: "시도 · 예산 한도 초과" },
    { id: "v13", source: "rplan", target: "hold", kind: "impl", tone: "failure", label: "사람 · 원천자료 필요" },

    /* 활성화 */
    { id: "e39", source: "tier1", target: "loader", kind: "impl", tone: "activate", label: "자동" },
    { id: "e40", source: "tier2", target: "loader", kind: "impl", tone: "verify", label: "감시 플래그" },
    { id: "e41", source: "loader", target: "master", kind: "impl", tone: "activate" },
    { id: "e42", source: "master", target: "consume", kind: "impl", tone: "activate" },
    // "실패가 더 이상 안 보인다"가 아니라 기계적 종료 조건으로 완료를 판정한다.
    { id: "e43", source: "master", target: "donecheck", kind: "impl", tone: "verify", label: "활성화 후 대사" },
    { id: "e44", source: "donecheck", target: "hold", kind: "impl", tone: "failure", label: "미해결 원인 명시" },

    /* 모델 공급 */
    { id: "s1", source: "models", target: "docmap", kind: "ref", tone: "model", label: "저비용" },
    { id: "s2", source: "models", target: "extract", kind: "ref", tone: "model", label: "정밀" },
    { id: "s3", source: "models", target: "audit", kind: "ref", tone: "model", label: "교차 공급자" },

    /* 저장 · 관측 — 단계별 산출물은 저장소 카드 본문에 이름으로 다 적었다.
     * 선을 전부 그리면 그림이 무너져서, 대표 두 줄만 남긴다. */
    { id: "s4", source: "staging", target: "store", kind: "impl", tone: "store", label: "후보 · 근거 · lineage" },
    { id: "s5", source: "store", target: "review", kind: "ref", tone: "store", label: "근거 조회" },
    { id: "s6", source: "gate", target: "observ", kind: "impl", tone: "store", label: "자동 처리율 · 격리율" },
    { id: "s7", source: "models", target: "observ", kind: "ref", tone: "store", label: "호출 · 비용" },

    /* 통제 경계 */
    { id: "s8", source: "boundary", target: "staging", kind: "ref", tone: "gate", label: "staging 까지만" },
    { id: "s9", source: "boundary", target: "loader", kind: "ref", tone: "gate", label: "ACTIVE 쓰기 독점" },

    /* 학습 루프 — 두 갈래 */
    { id: "s10", source: "review", target: "learn", kind: "impl", tone: "activate", label: "확정 사례" },
    { id: "s11", source: "learn", target: "adapter", kind: "impl", tone: "activate", label: "브랜드 고유 → vNext" },
    { id: "s12", source: "learn", target: "corefix", kind: "impl", tone: "deterministic", label: "범용 결함" },
    { id: "s13", source: "corefix", target: "golden", kind: "impl", tone: "verify", label: "전 브랜드 회귀" },
    { id: "s14", source: "observ", target: "golden", kind: "ref", tone: "verify", label: "지표 하락 케이스" },
    { id: "s15", source: "golden", target: "adapter", kind: "ref", tone: "activate", label: "회귀 통과분만 효력" },
    // 레지스트리는 차트 맨 아래(학습 루프 끝)에 놓이고 맨 위 라우팅으로 되돌아간다.
    // 그 세로 관통선을 실선으로 두면 본선처럼 읽혀서, 레지스트리 쪽 선은 전부 점선.
    { id: "s16", source: "adapterv", target: "adapter", kind: "ref", tone: "activate", label: "버전 고정 → 다음 배치" },
  ],
};
