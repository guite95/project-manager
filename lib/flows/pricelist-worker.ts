import type { FlowChart } from "@/components/flow/types";

/* -------------------------------------------------------------------------
 * 가격표 워커 상세 — apps/pricelist-worker.
 *
 * 원본(obs_docs/티앤에스/가격표 워커 상세 아키텍처.excalidraw)은 A~I 9개 섹션을
 * 위아래로 쌓은 **자료집**이다. 문제는 A섹션이 상태 이름(RECEIVED…COMPLETED)을
 * 9칸으로 늘어놓고, B~G가 **같은 단계를 한 번 더** 상세로 그린다는 것 —
 * 한 단계가 두 번씩 박스로 나온다. 게다가 섹션 안에서 닫히지 않는 박스
 * (Orchestrator·상태 머신·캐시·DLQ·인프라)가 많아 흐름이 끊긴다(59박스 50연결).
 *
 * 그래서 여기서는 **상태 이름을 그룹 라벨로 올려버렸다**. 상태 = 그 단계의
 * 상세 박스들이 사는 방이고, 방 안은 실제 처리 순서다. 중복 9박스가 사라진다.
 * 단계에 속하지 않는 것(실행 통제 · 저장 · 통제 경계 · 모델 정책 · 평가)은
 * 본선 옆 라인으로 뺐다.
 *
 * 검토 피드백 반영 (2차):
 *  1. Adapter vNext 가 **현재 배치의 본선으로 돌아온다**(adapterv → planner).
 *     이게 없으면 신규 브랜드 첫 배치는 어댑터만 만들고 끝나서 추출을 못 한다.
 *  2. 사람이 보는 화면을 둘로 쪼갰다. 온보딩 구조 확인(→ Adapter vNext)과
 *     격리 항목 검토(→ staging 갱신)는 완전히 다른 업무다. 한 노드로 두면
 *     단순 OCR 정정까지 브랜드 규칙으로 학습된다.
 *  3. Tier 3 수정 뒤 **재검증 루프**를 넣었다. 사람이 값을 고치면 기존
 *     dataset_hash 와 AUDIT-PASS 는 실효된다 — 관련 V 재실행 → 새 AUDIT-PASS
 *     → 게이트 재판정을 거쳐야 활성화 대상이 된다.
 *  4. 조립을 Axis Role → 유효 조합 → 빌더 → Identity·Relation Conflict 로
 *     펼쳤다. "값/규칙/링크 분리" 한 줄로는 구현자가 판단을 놓친다.
 *  5. AUDIT 결과를 **scope 단위**로 바꿨다. 배치 하나에 PASS 하나를 주면
 *     "일부 격리"와 "전체 검증 실패"를 구분할 수 없다.
 *  6. COMPLETED 를 상태로 쪼갰다(PARTIALLY_COMPLETED · AWAITING_REVIEW).
 *  7. "승인 로더" → "제한된 활성화 로더". Tier 1 은 AUTO_CONFIRM 이라
 *     사람 승인을 요구하면 자동화 전략과 어긋난다.
 *  8. schema mismatch 를 둘로 나눴다. 응답 형식 오류는 DLQ, 문서 구조 불일치
 *     (CONTRACT_MISMATCH)는 CHANGED/UNKNOWN 재라우팅. 구조 변경을 DLQ 로
 *     보내면 학습 루프가 아예 안 돈다.
 *  9. Artifact Recorder 를 실행 통제에 넣었다. 저장소가 staging 이후에만
 *     붙은 것처럼 보이던 문제 — 기록 창구를 하나 세우고 거기서 저장소로 간다.
 * 10. Page Fingerprint 의 클러스터를 Document Map 생성에도 넘긴다.
 *     382페이지를 무작정 개별 판독하지 않게 하는 입력이다.
 *
 * 검토 피드백 반영 (3차) — RECOVERY 그룹:
 *  실패 → 재시도 → DLQ 만으로는 실패를 안전하게 **보관**할 뿐 정확한 적재로
 *  수렴시키지 못한다. 그래서 실패·반려를 전부 한 곳으로 모으고, 거기서만
 *  복귀 지점을 정하게 했다.
 *   - Failure Classifier: 자유 오류 메시지 대신 표준 reason code.
 *     자유 텍스트만 저장하면 자동 복구를 코드로 짤 수 없다.
 *   - Recovery Planner: reason code → returnTo · strategy · maxAttempts.
 *     **재시도**(같은 입력·같은 모델 재실행)와 **재처리**(crop·해상도·문맥·
 *     모델·계약을 바꿔 영향 범위부터 다시)를 구분한다. 같은 호출 무한 반복은
 *     재처리가 아니다. AI 는 제안만 하고 허용 전략은 코드 정책이 정한다.
 *   - Artifact Invalidator: 산출물 DAG 에서 상위가 바뀌면 아래는 전부 STALE.
 *     dataset_hash 와 AUDIT-PASS 가 자동으로 실효되는 근거가 이것이다.
 *  나가는 점선 넷(재렌더 · 부분 온보딩 · 재판독 · 조립 재판정)이 원인별 복귀
 *  지점이다. 382페이지를 처음부터 다시 읽는 게 아니라 해당 열과 영향받은
 *  SKU 만 다시 돈다.
 *
 *  사람 반려도 DLQ 로 보내지 않는다 — 반려는 시스템 실패가 아니라 새로운
 *  정답 신호라서, reason code 를 달고 같은 복구 루프로 들어간다.
 *  완료 판정도 "실패가 안 보인다"가 아니라 기계적 종료 조건으로 한다.
 * ---------------------------------------------------------------------- */

export const pricelistWorker: FlowChart = {
  slug: "pricelist-worker",
  title: "가격표 워커 상세 — apps/pricelist-worker",
  description:
    "체크포인트 기반 배치 실행 · 의미 단위 추출 · scope 별 감사 · 격리 검토와 재검증",
  caption: "가격표 워커 상세",
  // 배치는 위에서 아래로 상태를 넘어가고, 한 상태 안에서는 좌→우로 처리된다.
  direction: "TB",
  groupDirection: "LR",
  nodeWidth: 250,

  howToRead: [
    "그룹 라벨이 곧 배치 상태 머신입니다. 방 하나가 상태 하나, 방 안 박스는 그 상태의 실제 처리 순서입니다.",
    "본선에 속하지 않는 실행 통제·저장·통제 경계·모델 정책·평가는 본선 옆 라인으로 빠져 있습니다.",
    "사람 화면은 둘로 분리되어 있습니다 — 온보딩 구조 확인(어댑터 학습)과 격리 항목 검토(staging 수정)는 다른 업무입니다.",
    "RECOVERY 그룹에서 나가는 점선 넷(재렌더·부분 온보딩·재판독·조립 재판정)이 원인별 복귀 지점입니다. 사람 반려도 DLQ 가 아니라 이 복구 루프로 들어갑니다.",
  ],

  groups: [
    {
      id: "g-run",
      label: "실행 통제 — 큐 lease · 체크포인트 · 순방향 전이만",
      kind: "store",
    },
    {
      id: "g-read",
      label: "RECEIVED → PROFILING → MAPPED — 문서를 읽고 지도를 만든다",
      kind: "entry",
    },
    {
      id: "g-route",
      label: "ROUTED — 브랜드 구조를 어댑터 계약과 대조",
      kind: "gate",
    },
    {
      id: "g-onboard",
      label: "ONBOARDING — 신규·변경 브랜드. 끝나면 현재 배치 본선으로 돌아온다",
      kind: "activate",
    },
    {
      id: "g-extract",
      label: "EXTRACTING — 의미 단위로 잘라 모델에 묻는다",
      kind: "model",
    },
    {
      id: "g-assemble",
      label: "ASSEMBLED — 모델 출력을 코드가 결정론적으로 조립",
      kind: "deterministic",
    },
    {
      id: "g-verify",
      label: "VERIFYING — V1~V9 기계 검증 + 다른 모델의 독립 감사",
      kind: "verify",
    },
    {
      id: "g-gate",
      label: "GATED — scope 별 위험도 티어 판정 · 최소 영향 범위",
      kind: "gate",
    },
    {
      id: "g-review",
      label: "격리 검토 · 재검증 — 사람이 확정 입력을 넣는 구간",
      kind: "entry",
    },
    // Recovery 3인방(Failure Classifier · Recovery Planner · Artifact
    // Invalidator)은 **그룹으로 묶지 않는다**. 그룹 박스는 Dagre 바깥 그래프에서
    // 랭크 하나를 통째로 차지해서, EXTRACTING 에서 들어오는 실패선 하나 때문에
    // 복구 밴드가 본선 중간(ASSEMBLED 앞)으로 끌려 올라간다 — 모든 배치가
    // 복구를 지나는 것처럼 읽힌다. 낱개로 두면 실패선이 닿는 자리에 붙는다.
  ],

  nodes: [
    /* ===== 실행 통제 — 모든 단계 위에 걸린다 ===== */
    {
      id: "resume",
      group: "g-run",
      data: {
        kind: "store",
        label: "부분 재개 · 캐시",
        sub: [
          "source/page/crop/prompt/model hash",
          "성공 shard 재호출 금지",
          "모델 바뀌면 영향 캐시만 무효화",
        ],
      },
    },
    {
      id: "orchestrator",
      group: "g-run",
      data: {
        kind: "store",
        label: "Orchestrator",
        sub: [
          "queue lease · heartbeat · dispatch",
          "checkpoint · retry budget · timeout",
          "idempotency key",
        ],
      },
    },
    {
      id: "artifact-contract",
      group: "g-run",
      data: {
        kind: "store",
        label: "단계 산출물 계약",
        sub: [
          "profile → document-map → plan",
          "pages/*.json → dataset → verify → gate",
          "리포트: pass·counts·hash·blind_spots",
        ],
      },
    },
    {
      id: "recorder",
      group: "g-run",
      data: {
        kind: "store",
        label: "Artifact Recorder",
        sub: [
          "단계 완료마다 입력 · 출력 기록",
          "prompt · adapter · model version",
          "source / page / crop hash",
          "저장소로 가는 단일 창구",
        ],
      },
    },
    {
      id: "state-guard",
      group: "g-run",
      data: {
        kind: "gate",
        label: "DB 상태 머신 · 권한",
        sub: [
          "순방향 전이만 · 산출물 없으면 거부",
          "evidence 없는 AUTO 후보 금지",
          "워커 계정은 ACTIVE 쓰기 불가",
        ],
      },
    },

    /* ===== RECEIVED → PROFILING → MAPPED ===== */
    {
      id: "ingest",
      group: "g-read",
      data: {
        kind: "entry",
        label: "Source Ingest",
        sub: [
          "MIME · 암호화 · 손상 검사",
          "source_hash · 에디션 후보",
          "원본은 Object Storage 불변 보관",
        ],
      },
    },
    {
      id: "render",
      group: "g-read",
      data: {
        kind: "deterministic",
        label: "Render · OCR",
        sub: [
          "내장 텍스트 우선",
          "250~300 DPI 렌더 · 회전 보정",
          "단어 bbox · 텍스트 밀도",
        ],
      },
    },
    {
      id: "finger",
      group: "g-read",
      data: {
        kind: "deterministic",
        label: "Page Fingerprint",
        sub: [
          "헤더·푸터·인쇄번호 offset",
          "코드/숫자 밀도 · 이미지 비율",
          "레이아웃 임베딩 · 클러스터",
        ],
      },
    },
    {
      id: "mapmodel",
      group: "g-read",
      data: {
        kind: "model",
        label: "Document Map (AI)",
        sub: [
          "INDEX/PRODUCT/RULE/SPEC/DIVIDER",
          "섹션 경계 · 연속표 · 제품 블록",
          "행축/열축 후보 · 판독 우선순위",
          "클러스터 대표 · 이상 페이지 우선",
        ],
      },
    },
    {
      id: "mapverify",
      group: "g-read",
      data: {
        kind: "verify",
        label: "Map 기계 검증",
        sub: [
          "전 페이지 정확히 1개 분류",
          "목차 ↔ 반복 헤더 ↔ 실제 페이지 대사",
          "미분류·중복 소속·offset 불일치 차단",
          "지도는 AI가, 완결성은 코드가 판정",
        ],
      },
    },

    /* ===== ROUTED ===== */
    {
      id: "compare",
      group: "g-route",
      data: {
        kind: "verify",
        label: "Structure Comparator",
        sub: [
          "신규 지도 ↔ 등록된 지문 비교",
          "섹션/표별 유사도",
          "축·밴드·규칙·코드 문법 diff",
          "브랜드 평균으로 뭉개지 않음",
        ],
      },
    },
    {
      id: "route-known",
      group: "g-route",
      data: {
        kind: "activate",
        label: "KNOWN — 본선 그대로",
        sub: [
          "계약과 불변식 일치",
          "기존 extraction contract 재사용",
          "경량·고처리량 모델",
        ],
      },
    },
    {
      id: "route-new",
      group: "g-route",
      data: {
        kind: "gate",
        label: "CHANGED · UNKNOWN — 온보딩 필요",
        sub: [
          "CHANGED: 변경된 섹션·표만 정찰",
          "UNKNOWN: 신규 브랜드·신규 메커니즘",
          "기존 스키마에 억지 매핑 금지",
        ],
      },
    },

    /* ===== ONBOARDING — 끝나면 현재 배치로 돌아온다 ===== */
    {
      id: "discover",
      group: "g-onboard",
      data: {
        kind: "model",
        label: "구조 카드 자동 생성",
        sub: [
          "목차 · 섹션 · 가격표 블록",
          "코드 문법 · 행/열축 · 마감/밴드",
          "통화 · VAT · 가격 메커니즘",
          "근거 · 반례 · UNKNOWN 포함",
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
          "골든/원본과 코드·셀·배치 대사",
          "충돌 0 · 누락 0 후 전수 확대",
        ],
      },
    },
    {
      id: "human",
      group: "g-onboard",
      data: {
        kind: "gate",
        label: "온보딩 구조 확인",
        sub: [
          "모델 grain · 행축 / 열축 의미",
          "브랜드 고유 라벨 · 문서 밖 계수",
          "net/PVP · VAT · 신규 메커니즘",
          "구조만 확정 — 값 정정은 하지 않음",
        ],
      },
    },
    {
      id: "agentrole",
      group: "g-onboard",
      data: {
        kind: "model",
        label: "Codex / Claude Code",
        sub: [
          "실패 리포트 기반 어댑터·테스트 구현",
          "반복 UNKNOWN 을 규칙으로",
          "매 배치 실행·자기 승인은 금지",
        ],
      },
    },
    {
      id: "adapterv",
      group: "g-onboard",
      data: {
        kind: "activate",
        label: "Adapter vNext",
        sub: [
          "detect/map/extract/normalize/verify",
          "worked examples · invariants",
          "현재 배치에 adapter_version 고정",
          "Registry 등록은 다음 배치용",
        ],
      },
    },

    /* ===== EXTRACTING ===== */
    {
      id: "planner",
      group: "g-extract",
      data: {
        kind: "deterministic",
        label: "Extraction Planner",
        sub: [
          "독립표 = crop",
          "연속표 = 앞뒤 1~2페이지",
          "제품명+도면+표 = 제품 블록",
          "expected schema · max attempts",
        ],
      },
    },
    {
      id: "batcher",
      group: "g-extract",
      data: {
        kind: "store",
        label: "Shard · Batch Scheduler",
        sub: [
          "page/table/crop 독립 job",
          "동시성 · rate limit · quota",
          "공유 prompt · adapter cache",
          "customId 로 결과 재결합",
        ],
      },
    },
    {
      id: "modelrouter",
      group: "g-extract",
      data: {
        kind: "model",
        label: "Model Router",
        sub: [
          "저비용: 분류·단순표",
          "중급: 기본 구조·표",
          "고급: 난항·UNKNOWN",
          "교차 모델: 고위험 감사",
        ],
      },
    },
    {
      id: "contract",
      group: "g-extract",
      data: {
        kind: "model",
        label: "Extraction Contract",
        sub: [
          "printedValue / normalizedValue",
          "page·table·cell bbox evidence",
          "rowAxes/columnAxes/headers/cells",
          "schemaMismatch 는 1급 결과",
        ],
      },
    },
    {
      id: "resultcheck",
      group: "g-extract",
      data: {
        kind: "verify",
        label: "즉시 결과 검사",
        sub: [
          "JSON Schema · 필수 근거",
          "헤더 수 ↔ 셀 수",
          "중복 · 빈 표 · 잘린 출력",
          "모델 confidence 로 승인 금지",
        ],
      },
    },
    {
      id: "escalate",
      group: "g-extract",
      data: {
        kind: "gate",
        label: "선택 재판독 · 실패 분류",
        sub: [
          "불명확 셀 = crop 확대",
          "표 구조 오류 = 표 전체 · 상위 모델",
          "INVALID_MODEL_OUTPUT → repair 1회",
          "CONTRACT_MISMATCH → 재라우팅",
          "PROVIDER / BUDGET 소진 → DLQ",
        ],
      },
    },

    /* ===== ASSEMBLED — 판정 계층을 펼친다 ===== */
    {
      id: "normalize",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Normalizer",
        sub: [
          "코드 · 수치 · 통화 · 단위",
          "브랜드 라벨 사전",
          "인쇄값은 그대로 보존",
          "문서 밖 값은 UNKNOWN",
        ],
      },
    },
    {
      id: "axisrole",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Axis Role Classifier",
        sub: [
          "SKU_IDENTITY / PRICE_SCOPE",
          "CONFIGURATION / DISPLAY_ATTRIBUTE",
          "판정 불가는 UNKNOWN 으로 남김",
          "모든 옵션을 SKU 로 만들지 않는다",
        ],
      },
    },
    {
      id: "combos",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Valid Combination Resolver",
        sub: [
          "원본에 있거나 명시 허용된 조합만",
          "카테시안 곱으로 임의 생성 금지",
          "스코프 전개 · 리졸버 유일해",
        ],
      },
    },
    {
      id: "assemble",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Catalog Assembler",
        sub: [
          "종류 → 컬렉션 → 모델 → SKU",
          "SKU Materializer",
          "Price Scope · Rule Builder",
          "Configuration Builder",
        ],
      },
    },
    {
      id: "relbuild",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Item Relationship Builder",
        sub: [
          "다른 품목의 필수·포함·호환·대체",
          "같은 모델의 변형은 관계가 아님",
          "밴드 · 할증은 가격 관계",
          "source/target/방향/조건/evidence 필수",
        ],
      },
    },
    {
      id: "identity",
      group: "g-assemble",
      data: {
        kind: "verify",
        label: "Identity · Relation Conflict",
        sub: [
          "SKU identity 유니크 · NULLS NOT DISTINCT",
          "같은 코드의 모델 scope 보존",
          "축 충돌 · 중복 · orphan 차단",
          "관계 대상 없음 · 순환 관계 차단",
        ],
      },
    },
    {
      id: "staging",
      group: "g-assemble",
      data: {
        kind: "deterministic",
        label: "Staging Writer",
        sub: [
          "candidate + evidence + lineage",
          "gate_status 미정",
          "batch transaction",
          "운영 마스터 직접 쓰기 없음",
        ],
      },
    },
    {
      id: "diff",
      group: "g-assemble",
      data: {
        kind: "verify",
        label: "Edition Diff",
        sub: [
          "신규 · 폐지 SKU",
          "가격 · 규칙 · 밴드 변경",
          "이전 ACTIVE 를 비교 오라클로",
        ],
      },
    },

    /* ===== VERIFYING ===== */
    {
      id: "v1v3",
      group: "g-verify",
      data: {
        kind: "verify",
        label: "V1~V3 — 값 · 카운트 · 결정성",
        sub: [
          "워크드예제 값 재현",
          "목차 · 코드 · 행 · 셀 수 대사",
          "스코프 전개 · 리졸버 유일해",
          "사각: 의미상 잘못된 모델 grain",
        ],
      },
    },
    {
      id: "v4v5",
      group: "g-verify",
      data: {
        kind: "verify",
        label: "V4~V5 — Diff · 교차 출처",
        sub: [
          "이전 에디션 구조 · 가격 diff",
          "PDF text ↔ OCR ↔ Vision ↔ XLSX",
          "사각: 여러 경로가 같이 틀린 경우",
        ],
      },
    },
    {
      id: "v6v7",
      group: "g-verify",
      data: {
        kind: "verify",
        label: "V6~V7 — 커버리지 · 변형",
        sub: [
          "전 페이지 코드 vs 조립분",
          "코드별 원본 가격셀 집합 대사",
          "사각: 값집합 같고 위치만 바뀐 경우",
        ],
      },
    },
    {
      id: "v8v9",
      group: "g-verify",
      data: {
        kind: "verify",
        label: "V8~V9 — 오배치 · Whole-missing",
        sub: [
          "열 이동 · 가격==사이즈 · 단조성",
          "페이지 인벤토리 vs staging",
          "표 · 디자인 전멸 탐지",
        ],
      },
    },
    {
      id: "semantic-audit",
      group: "g-verify",
      data: {
        kind: "model",
        label: "독립 의미 감사",
        sub: [
          "추출과 다른 모델·프롬프트·공급자",
          "신규 / 불일치 / 고위험 표만",
          "규칙 scope · 축 · grain 을 공격",
          "감사자는 staging 읽기 전용",
        ],
      },
    },
    {
      id: "auditpass",
      group: "g-verify",
      data: {
        kind: "activate",
        label: "AUDIT 결과 — scope 단위",
        sub: [
          "passedScopes / quarantinedScopes",
          "failedScopes / blindSpots",
          "dataset_hash · audited_by ≠ assembled_by",
          "배치 하나에 PASS 하나를 주지 않는다",
        ],
        doc: "AUDIT-PASS",
      },
    },

    /* ===== GATED ===== */
    {
      id: "tier1",
      group: "g-gate",
      data: {
        kind: "activate",
        label: "Tier 1 — AUTO_CONFIRM",
        sub: ["KNOWN 구조 · 교차 일치", "V1~V9 PASS · 새 규칙 없음"],
      },
    },
    {
      id: "tier2",
      group: "g-gate",
      data: {
        kind: "verify",
        label: "Tier 2 — MONITOR",
        sub: ["구조 · 가격은 확실", "저위험 속성만 사후 샘플"],
      },
    },
    {
      id: "tier3",
      group: "g-gate",
      data: {
        kind: "gate",
        label: "Tier 3 — QUARANTINE",
        sub: [
          "신규 구조 · 열 의미 · 가격 규칙",
          "문서 밖 값 · 교차 불일치",
          "DB 보존, ACTIVE 사용 금지",
        ],
      },
    },
    {
      id: "impact",
      group: "g-gate",
      data: {
        kind: "gate",
        label: "최소 영향 범위",
        sub: [
          "셀 오류 → 셀 / SKU",
          "열 헤더 → 열 전체",
          "표 구조 → 모델 · 섹션 구조 → 섹션",
          "정상 범위는 계속 자동 처리",
        ],
      },
    },

    /* ===== 격리 검토 · 재검증 — 온보딩 구조 확인과 다른 업무 ===== */
    {
      id: "qreview",
      group: "g-review",
      data: {
        kind: "entry",
        label: "격리 항목 검토",
        sub: [
          "셀 수정 · 관계 승인 · UNKNOWN 확정",
          "재판독 요청 · 원천 부족 판정",
          "근거 뷰어 · 전건 감사 로그",
          "값 정정을 브랜드 규칙으로 학습 금지",
        ],
      },
    },
    {
      id: "revise",
      group: "g-review",
      data: {
        kind: "verify",
        label: "Revised Candidate · 재검증",
        sub: [
          "덮어쓰지 않고 revision 추가",
          "rev1 AI 추출 · rev2 재판독 · rev3 사람 확정",
          "Axis Role · grain 재판정 포함",
          "영향 범위만 재조립 · 관련 V 재실행",
          "새 dataset_hash → 새 AUDIT-PASS",
        ],
      },
    },
    {
      id: "holdstate",
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

    /* ===== RECOVERY — 실패를 보관하는 게 아니라 수렴시킨다 ===== */
    {
      id: "failcls",
      data: {
        kind: "failure",
        label: "Failure Classifier",
        sub: [
          "기술: PROVIDER_TIMEOUT · RATE_LIMITED",
          "원본: SOURCE_CORRUPTED · OCR_LOW_QUALITY",
          "구조: CONTRACT_MISMATCH · COLUMN_ALIGNMENT",
          "조립: SKU_IDENTITY_CONFLICT · GRAIN_AMBIGUOUS",
          "검증: WHOLE_TABLE_MISSING · AUDIT_REJECTED",
          "사람: WRONG_AXIS_ROLE · SOURCE_REQUIRED",
        ],
      },
    },
    {
      id: "rplanner",
      data: {
        kind: "gate",
        label: "Recovery Planner",
        sub: [
          "reason code → returnTo · strategy",
          "영향 범위 산정 · maxAttempts · 비용 한도",
          "재시도(같은 입력) ≠ 재처리(방법 변경)",
          "사람 입력 필요 여부 · 재검증 범위 결정",
          "AI 는 제안, 허용 전략은 코드 정책",
        ],
      },
    },
    {
      id: "invalidator",
      data: {
        kind: "store",
        label: "Artifact Invalidator",
        sub: [
          "source → profile → map → extraction",
          "→ assembly → verify → audit → gate",
          "상위가 바뀌면 그 아래는 전부 STALE",
          "부분 범위면 그 scope 만 무효화",
          "REWORK_REQUIRED → REPROCESSING",
        ],
      },
    },

    /* ===== 본선에 걸리는 옆 라인 ===== */
    {
      id: "registry-read",
      data: {
        kind: "activate",
        label: "Adapter Registry",
        sub: [
          "브랜드 detect rules",
          "layout fingerprints",
          "extraction contracts · invariants",
          "버전별 효력 · 변경 이력",
        ],
      },
    },
    {
      id: "providerpolicy",
      data: {
        kind: "store",
        label: "모델 Provider 정책",
        sub: [
          "모델 ID · prompt version 고정",
          "ZDR · 보존기간 · 지역 정책",
          "키 · quota · rate limit · 비용 상한",
          "릴리스 게이트 통과분만 교체",
        ],
      },
    },
    {
      id: "stores",
      data: {
        kind: "store",
        label: "저장소 · lineage",
        sub: [
          "PostgreSQL: 상태·staging·검증·승인",
          "Object Storage: 원본·페이지·crop·원응답",
          "Queue: 단계·attempt·lease·DLQ",
          "prompt/adapter/model version 으로 재현",
        ],
      },
    },
    {
      id: "boundary",
      data: {
        kind: "gate",
        label: "통제 · 감사 경계",
        sub: [
          "워커 DB 역할은 staging/report 까지",
          "상태 전이·승인·재처리 append-only",
          "source_hash 멱등 · reload 는 명시 승인",
        ],
      },
    },
    {
      id: "fail",
      data: {
        kind: "failure",
        label: "FAILED / DLQ — 복구 한도 소진",
        sub: [
          "복구 전략 · 시도 · 예산을 다 쓴 것만",
          "PROVIDER · STORAGE · WORKER · BUDGET",
          "CONTRACT_MISMATCH · 사람 반려는 여기가 아님",
          "마지막 안전 checkpoint 유지",
        ],
      },
    },
    {
      id: "donecheck",
      data: {
        kind: "verify",
        label: "완료 판정 기준",
        sub: [
          "전 페이지 분류 · 표는 추출 또는 명시 제외",
          "코드·가격·변형·관계 커버리지 게이트 통과",
          "identity 충돌 0 · 근거 없는 자동 확정 0",
          "검증 실패 scope 0 · UNKNOWN 0 또는 명시 보류",
          "dataset_hash 기준 AUDIT-PASS 존재",
          "활성화 트랜잭션 사후 카운트 대사 통과",
        ],
      },
    },

    /* ===== 종료 · 활성화 ===== */
    {
      id: "completed",
      data: {
        kind: "activate",
        label: "배치 종료 — 상태 구분",
        sub: [
          "COMPLETED — 전 범위 정상 종료",
          "PARTIALLY_COMPLETED — 격리 잔여",
          "AWAITING_REVIEW — 활성화분 없음",
          "후보 집계: ACTIVE / MONITOR / QUARANTINED",
        ],
      },
    },
    {
      id: "activation",
      data: {
        kind: "activate",
        label: "제한된 활성화 로더 — 워커 권한 밖",
        sub: [
          "Tier 1 + AUDIT-PASS + hash → 자동",
          "Tier 2 → 활성화 + MONITOR 플래그",
          "신규 브랜드 · 구조 변경 → 사용자 승인",
          "Tier 3 → 직접 활성화 금지",
        ],
      },
    },

    /* ===== 학습 · 평가 루프 ===== */
    {
      id: "feedback",
      data: {
        kind: "activate",
        label: "확정 사례 분류",
        sub: [
          "브랜드 고유 판정 → 사전 · 워크드예제",
          "범용 결함 → 코어 · 공통 스키마",
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
      id: "metrics",
      data: {
        kind: "store",
        label: "품질 · 비용 지표",
        sub: [
          "표 발견 recall · 코드/가격 정확도",
          "변형 recall · 열 이동 · whole-missing",
          "자동 처리율 · 자동 확정 정확도",
          "격리율 · 페이지당 비용/시간",
        ],
      },
    },
    // 원본은 "골든 벤치마크"와 "릴리스 게이트"를 따로 그렸지만, 벤치마크가
    // 곧 배포 판정 기준이라 한 박스로 합쳤다.
    {
      id: "golden",
      data: {
        kind: "verify",
        label: "골든 벤치마크 · 릴리스 게이트",
        sub: [
          "Inbani 원본 + 검증셋 + 실패 페이지",
          "2열 시프트 · 형상 6/9 누락 · 전멸",
          "모델/프롬프트 전후 동일 평가셋",
          "정확도 하락 · 전멸 1건이면 배포 차단",
        ],
      },
    },
  ],

  edges: [
    /* 실행 통제 — 매 전이마다 도는 작은 고리
     *
     * 이웃한 두 카드 사이 간격은 ranksep(70px)뿐이라, 그보다 넓은 라벨은
     * 양옆 카드 글자를 덮는다. 카드 본문이 이미 말하는 내용은 라벨로 반복하지
     * 않는다 (r1·r4 가 그런 경우였다). */
    { id: "r1", source: "resume", target: "orchestrator", kind: "ref", tone: "store" },
    { id: "r2", source: "orchestrator", target: "artifact-contract", kind: "impl", tone: "store", label: "단계마다 산출물" },
    { id: "r3", source: "artifact-contract", target: "recorder", kind: "impl", tone: "store", label: "입력·출력·hash 기록" },
    { id: "r3b", source: "recorder", target: "state-guard", kind: "impl", tone: "store", label: "필수 산출물 검사" },
    { id: "r4", source: "state-guard", target: "orchestrator", kind: "ref", tone: "gate" },
    { id: "r5", source: "orchestrator", target: "ingest", kind: "impl", tone: "store", label: "큐 lease → 단계 dispatch" },
    { id: "r6", source: "recorder", target: "stores", kind: "impl", tone: "store", label: "모든 단계 artifact" },

    /* RECEIVED → MAPPED
     * 지문은 코드가, 지도는 AI가 만든다. 지문의 클러스터는 지도 생성의 입력으로
     * 넘어가고(382페이지를 개별 판독하지 않게), 검증 단계에서 둘을 다시 대조한다. */
    { id: "b1", source: "ingest", target: "render", kind: "impl", tone: "entry" },
    { id: "b2", source: "render", target: "finger", kind: "impl", tone: "deterministic" },
    { id: "b3", source: "render", target: "mapmodel", kind: "impl", tone: "model", label: "페이지 이미지 · 텍스트" },
    { id: "b3b", source: "finger", target: "mapmodel", kind: "impl", tone: "deterministic", label: "클러스터 · 대표 페이지" },
    { id: "b4", source: "finger", target: "mapverify", kind: "impl", tone: "deterministic", label: "페이지 사실" },
    { id: "b5", source: "mapmodel", target: "mapverify", kind: "impl", tone: "model", label: "페이지별 분류" },

    /* ROUTED */
    { id: "c0", source: "mapverify", target: "compare", kind: "impl", tone: "gate", label: "Document Map" },
    { id: "c1", source: "registry-read", target: "compare", kind: "ref", tone: "activate", label: "detect · 계약 · 불변식" },
    { id: "c2", source: "compare", target: "route-known", kind: "impl", tone: "activate", label: "일치" },
    { id: "c3", source: "compare", target: "route-new", kind: "impl", tone: "gate", label: "구조 변경 · 미등록" },

    /* ONBOARDING — 현재 배치 복귀가 핵심 */
    { id: "h0", source: "route-new", target: "discover", kind: "impl", tone: "gate", label: "부분 / 전체 온보딩" },
    { id: "h1", source: "discover", target: "pilot", kind: "impl", tone: "model" },
    { id: "h2", source: "pilot", target: "human", kind: "impl", tone: "gate" },
    { id: "h3", source: "human", target: "adapterv", kind: "impl", tone: "activate" },
    { id: "h4", source: "agentrole", target: "adapterv", kind: "ref", tone: "model" },
    { id: "h5", source: "adapterv", target: "planner", kind: "impl", tone: "activate", label: "현재 배치 본선 합류" },
    { id: "h6", source: "adapterv", target: "registry-read", kind: "ref", tone: "activate", label: "등록 → 다음 배치 재사용" },

    /* EXTRACTING
     * Extraction Contract 는 "거쳐 가는 단계"가 아니라 **답이 지켜야 할 형식**이다.
     * 모델 호출과 나란히 두고, 즉시 검사에서 둘을 맞춘다. */
    { id: "d0", source: "route-known", target: "planner", kind: "impl", tone: "model", label: "extraction plan" },
    { id: "d1", source: "planner", target: "batcher", kind: "impl", tone: "deterministic" },
    { id: "d1b", source: "planner", target: "contract", kind: "impl", tone: "model", label: "expected schema" },
    { id: "d2", source: "batcher", target: "modelrouter", kind: "impl", tone: "store" },
    { id: "d3", source: "modelrouter", target: "resultcheck", kind: "impl", tone: "model", label: "JSON + evidence" },
    { id: "d4", source: "contract", target: "resultcheck", kind: "ref", tone: "model", label: "이 형식대로 왔는지" },
    { id: "d5", source: "resultcheck", target: "escalate", kind: "impl", tone: "gate" },
    { id: "d6", source: "escalate", target: "modelrouter", kind: "ref", tone: "gate", label: "문맥 · 모델 승격" },
    { id: "d7", source: "providerpolicy", target: "modelrouter", kind: "ref", tone: "store", label: "모델 · prompt 고정" },
    // 같은 단계에서 못 푸는 것은 DLQ 가 아니라 복구 루프로 간다.
    // 복귀 지점은 Recovery Planner 한 곳에서만 정한다.
    { id: "d8", source: "escalate", target: "failcls", kind: "impl", tone: "failure", label: "재시도로 안 되는 것" },

    /* ASSEMBLED */
    { id: "e0", source: "resultcheck", target: "normalize", kind: "impl", tone: "deterministic", label: "page JSON + evidence" },
    { id: "e1", source: "normalize", target: "axisrole", kind: "impl", tone: "deterministic" },
    { id: "e1b", source: "axisrole", target: "combos", kind: "impl", tone: "deterministic", label: "SKU_IDENTITY 축만" },
    { id: "e1c", source: "combos", target: "assemble", kind: "impl", tone: "deterministic" },
    { id: "e1d", source: "axisrole", target: "relbuild", kind: "impl", tone: "deterministic", label: "각주 · 병기 코드 · 도면" },
    { id: "e2", source: "assemble", target: "identity", kind: "impl", tone: "verify" },
    { id: "e2b", source: "relbuild", target: "identity", kind: "impl", tone: "verify", label: "item_links 후보" },
    { id: "e3", source: "identity", target: "staging", kind: "impl", tone: "deterministic" },
    { id: "e4", source: "staging", target: "diff", kind: "impl", tone: "verify" },
    { id: "e5", source: "staging", target: "stores", kind: "impl", tone: "store", label: "candidate · 근거 · lineage" },
    { id: "e6", source: "boundary", target: "staging", kind: "ref", tone: "gate" },

    /* VERIFYING
     * V1~V9 는 순서대로 밟는 절차가 아니라 **두 갈래 검사 묶음**이다.
     * 값·출처 계열과 커버리지·배치 계열이 각각 돌고 감사로 합류한다. */
    { id: "f0", source: "diff", target: "v1v3", kind: "impl", tone: "verify", label: "값 · 출처 계열" },
    { id: "f0b", source: "diff", target: "v6v7", kind: "impl", tone: "verify", label: "커버리지 계열" },
    { id: "f1", source: "v1v3", target: "v4v5", kind: "impl", tone: "verify" },
    { id: "f2", source: "v4v5", target: "semantic-audit", kind: "impl", tone: "model" },
    { id: "f3", source: "v6v7", target: "v8v9", kind: "impl", tone: "verify" },
    { id: "f4", source: "v8v9", target: "semantic-audit", kind: "impl", tone: "model", label: "고위험 표만" },
    { id: "f5", source: "semantic-audit", target: "auditpass", kind: "impl", tone: "activate" },
    { id: "f6", source: "stores", target: "semantic-audit", kind: "ref", tone: "store", label: "근거 읽기 전용" },

    /* GATED — scope 별로 갈린다. 셋 다 같은 배치에서 동시에 나올 수 있다. */
    { id: "g1", source: "auditpass", target: "tier1", kind: "impl", tone: "activate", label: "passed → Tier 1" },
    { id: "g2", source: "auditpass", target: "tier2", kind: "impl", tone: "verify", label: "passed → Tier 2" },
    { id: "g3", source: "auditpass", target: "tier3", kind: "impl", tone: "gate", label: "quarantined" },
    { id: "g3b", source: "auditpass", target: "failcls", kind: "impl", tone: "failure", label: "failedScopes" },
    { id: "g4", source: "tier3", target: "impact", kind: "impl", tone: "gate", label: "격리 범위 산정" },

    /* 격리 검토 → 재검증 → 게이트 재판정
     * 사람 수정은 검증 면제가 아니다. 되돌아가는 선이라 점선으로 둔다 —
     * 실선으로 두면 차트 아래에서 위로 본선이 하나 더 있는 것처럼 읽힌다. */
    { id: "k1", source: "impact", target: "qreview", kind: "impl", tone: "gate", label: "격리분만 사람 검토" },
    { id: "k2", source: "qreview", target: "revise", kind: "impl", tone: "verify", label: "값 확정 · 승인" },
    // 사람 반려는 시스템 실패가 아니라 새로운 정답 신호다. DLQ 가 아니라
    // reason code 를 달고 복구 루프로 들어간다.
    { id: "k3", source: "qreview", target: "failcls", kind: "impl", tone: "failure", label: "반려 사유 · 재판독 요청" },
    { id: "k5", source: "revise", target: "v1v3", kind: "ref", tone: "verify", label: "관련 V 재실행 → 재판정" },

    /* RECOVERY — 나가는 점선 넷이 원인별 복귀 지점이다.
     * 항상 처음부터가 아니라 가장 가까운 올바른 단계로 되돌아간다. */
    { id: "w1", source: "activation", target: "failcls", kind: "impl", tone: "failure", label: "활성화 실패" },
    { id: "w2", source: "failcls", target: "rplanner", kind: "impl", tone: "failure", label: "reason code" },
    { id: "w3", source: "rplanner", target: "invalidator", kind: "impl", tone: "gate", label: "복구 계획" },
    { id: "w4", source: "invalidator", target: "render", kind: "ref", tone: "deterministic", label: "원본 · OCR → 재렌더" },
    { id: "w5", source: "invalidator", target: "route-new", kind: "ref", tone: "gate", label: "CONTRACT_MISMATCH → 부분 온보딩" },
    { id: "w6", source: "invalidator", target: "planner", kind: "ref", tone: "model", label: "재판독 · crop 확대 · 모델 승격" },
    // 조립 복귀(SKU_IDENTITY_CONFLICT · GRAIN_AMBIGUOUS)는 별도 선을 긋지 않고
    // Revised Candidate 가 흡수한다. invalidator → axisrole 을 그리면 dagre 가
    // 복구 그룹을 EXTRACTING 과 ASSEMBLED **사이**에 끼워 넣어서, 복구가
    // 모든 배치가 지나는 본선 단계처럼 읽힌다.
    { id: "w8", source: "invalidator", target: "v1v3", kind: "ref", tone: "verify", label: "재검증만 필요한 경우" },
    { id: "w9", source: "rplanner", target: "fail", kind: "impl", tone: "failure", label: "시도 · 예산 한도 초과" },
    { id: "w10", source: "rplanner", target: "holdstate", kind: "impl", tone: "failure", label: "사람 · 원천자료 필요" },

    /* 종료 · 활성화 */
    { id: "t1", source: "tier1", target: "completed", kind: "impl", tone: "activate", label: "자동 확정" },
    { id: "t2", source: "tier2", target: "completed", kind: "impl", tone: "verify", label: "반영 후 감시" },
    { id: "t3", source: "impact", target: "completed", kind: "impl", tone: "gate", label: "정상 범위만 계속" },
    { id: "t5", source: "completed", target: "activation", kind: "impl", tone: "activate", label: "Tier 1 자동 · Tier 2 감시" },
    { id: "t6", source: "boundary", target: "activation", kind: "ref", tone: "gate", label: "ACTIVE 쓰기는 로더만" },
    // "실패가 더 이상 안 보인다"가 아니라 기계적 종료 조건으로 판정한다.
    { id: "t7", source: "donecheck", target: "completed", kind: "ref", tone: "verify", label: "종료 조건" },

    /* 학습 · 평가 루프 — 브랜드 고유와 범용 결함을 나눈다 */
    { id: "l1", source: "qreview", target: "feedback", kind: "impl", tone: "activate", label: "확정 사례" },
    { id: "l1b", source: "human", target: "feedback", kind: "ref", tone: "activate", label: "구조 확정 사례" },
    { id: "l2", source: "completed", target: "metrics", kind: "impl", tone: "store", label: "자동 처리율 · 비용" },
    { id: "l3", source: "feedback", target: "registry-read", kind: "impl", tone: "activate", label: "브랜드 사전 · 워크드예제" },
    { id: "l4", source: "feedback", target: "corefix", kind: "impl", tone: "deterministic", label: "범용 결함" },
    { id: "l5", source: "corefix", target: "golden", kind: "impl", tone: "verify", label: "전 브랜드 회귀" },
    { id: "l6", source: "metrics", target: "golden", kind: "ref", tone: "verify", label: "지표 하락 케이스" },
    // golden → providerpolicy 로 고리를 닫으면 차트 맨 아래에서 맨 위로
    // 되돌아오는 선이 생겨 그림이 무너진다. 그 제약은 providerpolicy 카드
    // 본문("릴리스 게이트 통과분만 교체")으로 옮겼다.
  ],
};
