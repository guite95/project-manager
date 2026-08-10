import assert from "node:assert/strict";
import test from "node:test";

async function loadChart() {
  try {
    return (await import("./pricelist-human-review.ts")).pricelistHumanReview;
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") return undefined;
    throw error;
  }
}

test("사람 검토형 파이프라인 차트가 티앤에스 경로용 식별자를 제공한다", async () => {
  const chart = await loadChart();

  assert.equal(chart?.slug, "pricelist-human-review");
  assert.equal(chart?.title, "사람 검토형 파이프라인");
});

test("17개 본선 단계가 기계 처리와 REVIEW_PENDING 사람 게이트를 번갈아 제공한다", async () => {
  const chart = await loadChart();
  const numbered = chart.nodes.filter((node) => /^\d+\./.test(node.data.label));

  assert.deepEqual(
    numbered.map((node) => node.data.label),
    [
      "1. PDF 접수",
      "2. 사람 확인 — 적재 범위 확정",
      "3. OCR · 내장 텍스트 · bbox 증거 생성",
      "4. 사람 확인 — 텍스트 근거 확정",
      "5. 표 · 제품 영역 발견",
      "6. 사람 확인 — 추출 영역 확정",
      "7. 표 골격 추출",
      "8. 사람 확인 — 골격 승인",
      "9. 값 추출",
      "10. 사람 확인 — 값 대조·수정",
      "11. 결정론적 상품 후보 조립",
      "12. 사람 확인 — 조립 관계 확정",
      "13. 자동 검증 · TABLE_ONLY 골든 비교",
      "14. 사람 확인 — finding 처리",
      "15. price_import_candidates staging 적재",
      "16. 사람 확인 — 운영 Diff 최종 승인",
      "17. 운영 활성화",
    ]
  );

  numbered.forEach((node, index) => {
    const step = index + 1;
    const detail = Array.isArray(node.data.sub)
      ? node.data.sub.join(" ")
      : (node.data.sub ?? "");
    if (step % 2 === 0) {
      assert.equal(node.data.kind, "gate", `${step}단계는 사람 게이트여야 한다`);
      assert.match(detail, /REVIEW_PENDING/);
    } else {
      assert.notEqual(node.data.kind, "gate", `${step}단계는 기계 처리여야 한다`);
    }
  });
});

test("검토 상태·revision 피드백과 staging 승인 경계를 명시한다", async () => {
  const chart = await loadChart();
  const byId = new Map(chart.nodes.map((node) => [node.id, node]));
  const edgePairs = new Set(
    chart.edges.map((edge) => `${edge.source}->${edge.target}`)
  );

  assert.deepEqual(
    [
      byId.get("review-pending-state")?.data.kind,
      byId.get("needs-input")?.data.kind,
      byId.get("rework-required")?.data.kind,
    ],
    ["gate", "entry", "failure"]
  );
  assert.equal(byId.get("needs-input")?.data.label, "NEEDS_INPUT — 정보 부족");
  assert.equal(
    byId.get("review-pending-state")?.data.label,
    "REVIEW_PENDING — 사람 확인 대기"
  );
  assert.equal(
    byId.get("rework-required")?.data.label,
    "REWORK_REQUIRED — 오류 수정 후 재처리"
  );
  assert.equal(
    byId.get("artifact-invalidate")?.data.label,
    "하위 산출물 STALE 무효화"
  );
  assert.equal(byId.get("new-revision")?.data.label, "새 revision 생성 · 재처리");
  assert.equal(
    byId.get("return-point")?.data.label,
    "가장 가까운 기계 단계로 복귀"
  );

  const mainIds = [
    "pdf-intake",
    "scope-review",
    "text-evidence",
    "text-review",
    "region-discovery",
    "region-review",
    "skeleton-extract",
    "skeleton-review",
    "value-extract",
    "value-review",
    "candidate-assemble",
    "candidate-review",
    "auto-validate",
    "finding-review",
    "staging-write",
    "diff-review",
    "activate",
  ];
  for (let index = 0; index < mainIds.length - 1; index += 1) {
    assert.ok(
      edgePairs.has(`${mainIds[index]}->${mainIds[index + 1]}`),
      `${mainIds[index]}에서 ${mainIds[index + 1]}로 본선이 이어져야 한다`
    );
  }

  assert.ok(edgePairs.has("needs-input->artifact-invalidate"));
  assert.ok(edgePairs.has("rework-required->artifact-invalidate"));
  assert.ok(edgePairs.has("artifact-invalidate->new-revision"));
  assert.ok(edgePairs.has("scope-review->review-pending-state"));
  assert.ok(edgePairs.has("return-point->review-pending-state"));
  const exceptionTransitions = chart.edges.filter((edge) =>
    ["needs-input", "rework-required"].includes(edge.target)
  );
  assert.deepEqual(
    exceptionTransitions.map((edge) => `${edge.source}->${edge.target}`),
    [
      "review-pending-state->needs-input",
      "review-pending-state->rework-required",
    ]
  );
  assert.ok(exceptionTransitions.every((edge) => edge.kind === "impl"));
  assert.deepEqual(
    new Set(
      chart.edges
        .filter((edge) => edge.source === "new-revision")
        .map((edge) => edge.target)
    ),
    new Set(["return-point"])
  );

  const policy = chart.howToRead?.join(" ") ?? "";
  assert.match(policy, /신규 브랜드와 변경 레이아웃은 전수 검토/);
  assert.match(
    policy,
    /골든 테스트를 반복 통과한 KNOWN 레이아웃만 위험 기반 검토/
  );
  assert.match(policy, /최종 활성화는 항상 사람 승인/);
  assert.match(policy, /워커는 price_import_candidates staging까지만/);

  const finalApproval = byId.get("diff-review")?.data.sub;
  const finalApprovalDetail = Array.isArray(finalApproval)
    ? finalApproval.join(" ")
    : (finalApproval ?? "");
  assert.match(finalApprovalDetail, /2인 승인/);
});
