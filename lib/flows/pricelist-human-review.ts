import type { FlowChart } from "@/components/flow/types";

export const pricelistHumanReview: FlowChart = {
  slug: "pricelist-human-review",
  title: "사람 검토형 파이프라인",
  description:
    "PDF 접수부터 운영 활성화까지 기계 처리와 사람 승인 게이트를 번갈아 보는 흐름",
  caption: "17단계 본선 · 사람 게이트 · revision 재처리 · 운영 승인 경계",
  direction: "TB",
  groupDirection: "LR",
  nodeWidth: 280,
  howToRead: [
    "번호 순서가 본선입니다. 기계 처리 다음의 주황색 사람 확인 게이트는 정상 검토 대기 상태 REVIEW_PENDING이며, 승인·수정·반려 결과를 기록합니다.",
    "정보나 원천자료가 부족하면 NEEDS_INPUT, 오류나 상위 단계 수정이 발견되면 REWORK_REQUIRED로 분리합니다. 둘은 정상 검토 대기와 다른 상태입니다.",
    "사람이 상위 단계 값을 바꾸면 그 지점 아래 산출물만 STALE로 무효화하고, 덮어쓰지 않은 새 revision으로 가장 가까운 기계 처리 단계부터 재처리합니다.",
    "신규 브랜드와 변경 레이아웃은 전수 검토합니다. 골든 테스트를 반복 통과한 KNOWN 레이아웃만 위험 기반 검토로 낮추되, 최종 활성화는 항상 사람 승인입니다.",
    "워커는 price_import_candidates staging까지만 씁니다. 운영 마스터 활성화는 별도 승인 경계 뒤의 전용 로더만 수행하며, 정책에 따라 2인 승인을 요구할 수 있습니다.",
  ],
  groups: [
    {
      id: "g-intake",
      label: "1–4. 접수·텍스트 증거 — 기계 처리와 사람 확인",
      kind: "entry",
    },
    {
      id: "g-structure",
      label: "5–8. 영역·표 골격 — 승인된 구조는 값 추출이 변경할 수 없음",
      kind: "model",
    },
    {
      id: "g-values",
      label: "9–12. 값 추출·후보 조립 — 원본 대조 후 관계 확정",
      kind: "deterministic",
    },
    {
      id: "g-validate",
      label: "13–15. 자동 검증·staging — 워커 쓰기 권한은 여기까지",
      kind: "verify",
    },
    {
      id: "g-activate",
      label: "16–17. 별도 사람 승인 경계 — 운영 마스터 활성화",
      kind: "activate",
    },
    {
      id: "g-revision",
      label: "검토 예외·revision 제어 — 정상 대기와 정보 부족·재처리를 분리",
      kind: "failure",
    },
  ],
  nodes: [
    {
      id: "pdf-intake",
      group: "g-intake",
      data: {
        kind: "entry",
        label: "1. PDF 접수",
        sub: [
          "원본 PDF 불변 보관",
          "source_hash · 접수 revision 생성",
        ],
      },
    },
    {
      id: "scope-review",
      group: "g-intake",
      data: {
        kind: "gate",
        label: "2. 사람 확인 — 적재 범위 확정",
        sub: [
          "REVIEW_PENDING · 브랜드 · 에디션",
          "통화 · 세금 · 전체/부분 PDF",
          "이번 적재 scope 승인",
        ],
      },
    },
    {
      id: "text-evidence",
      group: "g-intake",
      data: {
        kind: "model",
        label: "3. OCR · 내장 텍스트 · bbox 증거 생성",
        sub: [
          "페이지 렌더 · OCR · 내장 텍스트 병렬",
          "word/cell bbox · crop · confidence",
          "원본 좌표와 판독값을 함께 보존",
        ],
      },
    },
    {
      id: "text-review",
      group: "g-intake",
      data: {
        kind: "gate",
        label: "4. 사람 확인 — 텍스트 근거 확정",
        sub: [
          "REVIEW_PENDING · 원본/overlay 대조",
          "OCR 또는 내장 텍스트 선택",
          "누락 · 오독 수정",
        ],
      },
    },
    {
      id: "region-discovery",
      group: "g-structure",
      data: {
        kind: "model",
        label: "5. 표 · 제품 영역 발견",
        sub: [
          "짧고 자기완결 PDF = 직접 추출",
          "긴 문서 · 페이지 간 문맥 = Document Map 가능",
          "표 · 제품 블록 · 규칙 영역 후보",
        ],
      },
    },
    {
      id: "region-review",
      group: "g-structure",
      data: {
        kind: "gate",
        label: "6. 사람 확인 — 추출 영역 확정",
        sub: [
          "REVIEW_PENDING · 표 bbox · 제품 블록",
          "규칙 영역 · 연속표 관계",
          "추출 제외 영역 확정",
        ],
      },
    },
    {
      id: "skeleton-extract",
      group: "g-structure",
      data: {
        kind: "deterministic",
        label: "7. 표 골격 추출",
        sub: [
          "표 개수 · 행축 · 열축",
          "상품 단위 · 옵션 축",
          "고정 가격 vs 계산형 가격",
        ],
      },
    },
    {
      id: "skeleton-review",
      group: "g-structure",
      data: {
        kind: "gate",
        label: "8. 사람 확인 — 골격 승인",
        sub: [
          "REVIEW_PENDING · 골격 승인 또는 수정",
          "승인 skeleton은 revision에 고정",
          "값 추출 단계의 임의 변경 금지",
        ],
      },
    },
    {
      id: "value-extract",
      group: "g-values",
      data: {
        kind: "model",
        label: "9. 값 추출",
        sub: [
          "상품 코드 · 옵션 · 가격 · 빈 셀",
          "주문 불가 · 가격 문의",
          "계산식 · 코드 패턴",
          "승인된 골격 안에서만 판독",
        ],
      },
    },
    {
      id: "value-review",
      group: "g-values",
      data: {
        kind: "gate",
        label: "10. 사람 확인 — 값 대조·수정",
        sub: [
          "REVIEW_PENDING · 원본 crop",
          "코드-옵션-가격 묶음 대조",
          "누락 · 오독 값 수정",
        ],
      },
    },
    {
      id: "candidate-assemble",
      group: "g-values",
      data: {
        kind: "deterministic",
        label: "11. 결정론적 상품 후보 조립",
        sub: [
          "상품-옵션-가격 관계",
          "natural key · 중복",
          "규칙 적용 범위",
          "임의 카테시안 곱 금지",
        ],
      },
    },
    {
      id: "candidate-review",
      group: "g-values",
      data: {
        kind: "gate",
        label: "12. 사람 확인 — 조립 관계 확정",
        sub: [
          "REVIEW_PENDING · 후보 관계 대조",
          "부분 적재 시 기존 상품 폐지 여부",
          "유지 · supersede 범위 확정",
        ],
      },
    },
    {
      id: "auto-validate",
      group: "g-validate",
      data: {
        kind: "verify",
        label: "13. 자동 검증 · TABLE_ONLY 골든 비교",
        sub: [
          "누락 · 초과 · 중복",
          "코드 · 가격 · 계산 규칙 차이",
          "TABLE_ONLY golden JSON",
          "결정론적 count · coverage 대사",
        ],
      },
    },
    {
      id: "finding-review",
      group: "g-validate",
      data: {
        kind: "gate",
        label: "14. 사람 확인 — finding 처리",
        sub: [
          "REVIEW_PENDING · finding 승인/반려",
          "재처리 시작 지점 지정",
          "사람 수정도 검증 우회 불가",
        ],
      },
    },
    {
      id: "staging-write",
      group: "g-validate",
      data: {
        kind: "store",
        label: "15. price_import_candidates staging 적재",
        sub: [
          "candidate + evidence + lineage",
          "워커 쓰기 권한의 마지막 경계",
          "운영 마스터 직접 쓰기 금지",
        ],
      },
    },
    {
      id: "diff-review",
      group: "g-activate",
      data: {
        kind: "gate",
        label: "16. 사람 확인 — 운영 Diff 최종 승인",
        sub: [
          "REVIEW_PENDING · 기존 vs 신규/변경/폐지",
          "최종 활성화는 항상 사람 승인",
          "정책에 따라 2인 승인",
        ],
      },
    },
    {
      id: "activate",
      group: "g-activate",
      data: {
        kind: "activate",
        label: "17. 운영 활성화",
        sub: [
          "승인 토큰을 가진 별도 로더만 실행",
          "에디션 전환 · 발효일",
          "ACTIVE 마스터 운영 소비",
        ],
      },
    },
    {
      id: "review-pending-state",
      group: "g-revision",
      data: {
        kind: "gate",
        label: "REVIEW_PENDING — 사람 확인 대기",
        sub: [
          "2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 공통",
          "정상 산출물 완료 후 검토 큐 진입",
          "승인 · 정보 요청 · 재처리로 분기",
        ],
      },
    },
    {
      id: "needs-input",
      group: "g-revision",
      data: {
        kind: "entry",
        label: "NEEDS_INPUT — 정보 부족",
        sub: [
          "브랜드 · 에디션 · 통화 · 세금 미확정",
          "부분 PDF 범위 · 문서 밖 판단 부족",
          "추측하지 않고 입력 보강 대기",
        ],
      },
    },
    {
      id: "rework-required",
      group: "g-revision",
      data: {
        kind: "failure",
        label: "REWORK_REQUIRED — 오류 수정 후 재처리",
        sub: [
          "OCR 오독 · 영역 · 골격 · 값 · 관계 오류",
          "finding 반려 · 최종 Diff 반려",
          "수정 지점과 reason code 기록",
        ],
      },
    },
    {
      id: "artifact-invalidate",
      group: "g-revision",
      data: {
        kind: "store",
        label: "하위 산출물 STALE 무효화",
        sub: [
          "상위 수정 지점 아래 artifact만",
          "승인 skeleton · dataset hash · 검증 실효",
          "기존 revision과 감사 이력은 보존",
        ],
      },
    },
    {
      id: "new-revision",
      group: "g-revision",
      data: {
        kind: "deterministic",
        label: "새 revision 생성 · 재처리",
        sub: [
          "덮어쓰기 없이 correction lineage 추가",
          "가장 가까운 올바른 단계로 복귀",
          "하위 승인 게이트와 검증 다시 수행",
        ],
      },
    },
    {
      id: "return-point",
      group: "g-revision",
      data: {
        kind: "model",
        label: "가장 가까운 기계 단계로 복귀",
        sub: [
          "3 · 5 · 7 · 9 · 11 · 13 중 선택",
          "수정 지점별 영향 범위만 재처리",
          "완료 후 해당 사람 게이트 REVIEW_PENDING",
        ],
      },
    },
  ],
  edges: [
    /* 1–17 본선 — 기계 처리와 사람 확인 게이트가 교대한다. */
    {
      id: "e01",
      source: "pdf-intake",
      target: "scope-review",
      kind: "impl",
      tone: "entry",
    },
    {
      id: "e02",
      source: "scope-review",
      target: "text-evidence",
      kind: "impl",
      tone: "gate",
    },
    {
      id: "e03",
      source: "text-evidence",
      target: "text-review",
      kind: "impl",
      tone: "model",
    },
    {
      id: "e04",
      source: "text-review",
      target: "region-discovery",
      kind: "impl",
      tone: "gate",
    },
    {
      id: "e05",
      source: "region-discovery",
      target: "region-review",
      kind: "impl",
      tone: "model",
    },
    {
      id: "e06",
      source: "region-review",
      target: "skeleton-extract",
      kind: "impl",
      tone: "gate",
    },
    {
      id: "e07",
      source: "skeleton-extract",
      target: "skeleton-review",
      kind: "impl",
      tone: "deterministic",
    },
    {
      id: "e08",
      source: "skeleton-review",
      target: "value-extract",
      kind: "impl",
      tone: "gate",
      label: "골격 고정",
    },
    {
      id: "e09",
      source: "value-extract",
      target: "value-review",
      kind: "impl",
      tone: "model",
    },
    {
      id: "e10",
      source: "value-review",
      target: "candidate-assemble",
      kind: "impl",
      tone: "gate",
    },
    {
      id: "e11",
      source: "candidate-assemble",
      target: "candidate-review",
      kind: "impl",
      tone: "deterministic",
    },
    {
      id: "e12",
      source: "candidate-review",
      target: "auto-validate",
      kind: "impl",
      tone: "gate",
    },
    {
      id: "e13",
      source: "auto-validate",
      target: "finding-review",
      kind: "impl",
      tone: "verify",
    },
    {
      id: "e14",
      source: "finding-review",
      target: "staging-write",
      kind: "impl",
      tone: "gate",
      label: "finding 확정",
    },
    {
      id: "e15",
      source: "staging-write",
      target: "diff-review",
      kind: "impl",
      tone: "store",
      label: "별도 승인 경계",
    },
    {
      id: "e16",
      source: "diff-review",
      target: "activate",
      kind: "impl",
      tone: "activate",
      label: "사람 최종 승인",
    },

    /* 검토 예외 — 본선의 모든 사람 게이트를 공통 REVIEW_PENDING 상태로 모아
     * NEEDS_INPUT과 REWORK_REQUIRED를 정상 대기와 분명히 구분한다. */
    {
      id: "x01",
      source: "scope-review",
      target: "review-pending-state",
      kind: "ref",
      tone: "gate",
      label: "모든 사람 게이트 공통",
    },
    {
      id: "x02",
      source: "review-pending-state",
      target: "needs-input",
      kind: "impl",
      tone: "entry",
      label: "정보 부족",
    },
    {
      id: "x03",
      source: "review-pending-state",
      target: "rework-required",
      kind: "impl",
      tone: "failure",
      label: "수정 · 반려",
    },
    {
      id: "x09",
      source: "needs-input",
      target: "artifact-invalidate",
      kind: "impl",
      tone: "entry",
      label: "입력 보강",
    },
    {
      id: "x10",
      source: "rework-required",
      target: "artifact-invalidate",
      kind: "impl",
      tone: "failure",
      label: "상위 값 수정",
    },
    {
      id: "x11",
      source: "artifact-invalidate",
      target: "new-revision",
      kind: "impl",
      tone: "store",
      label: "영향 범위만",
    },

    /* 새 revision은 원인과 수정 지점에 따라 가장 가까운 단계로 돌아간다.
     * 복귀 지점을 한 카드에 명시하고 그룹 안에서 재검토 loop를 닫아, 긴 선이
     * 본선 카드를 관통하거나 목적지를 가리는 문제를 피한다. */
    {
      id: "r01",
      source: "new-revision",
      target: "return-point",
      kind: "impl",
      tone: "model",
      label: "returnTo 지정",
    },
    {
      id: "r02",
      source: "return-point",
      target: "review-pending-state",
      kind: "ref",
      tone: "gate",
      label: "재처리 완료 → 재검토",
    },
  ],
};
