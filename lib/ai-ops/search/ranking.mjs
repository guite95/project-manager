import { interpretMessage, lexicalEvidence, INTERPRETATION_VERSION } from "./interpretation.mjs";
export function reciprocalRankFusion(lists, k = 60, weights = []) {
  const scores = new Map();
  for (const [listIndex, list] of lists.entries()) {
    const seen = new Set();
    let rank = 0;
    for (const row of list) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rank++;
      const current = scores.get(row.id) ?? { ...row, score: 0 };
      current.score += (weights[listIndex] ?? 1) / (k + rank);
      scores.set(row.id, current);
    }
  }
  return [...scores.values()].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
}
export function evaluateRanking(ids, relevant) {
  const ranked = [...new Set(ids)],
    positives = Object.entries(relevant).filter(([, v]) => v > 0);
  if (!positives.length)
    throw new Error("Evaluation requires judged relevant sessions");
  const gain = (grades) =>
    grades.reduce((sum, g, i) => sum + (2 ** g - 1) / Math.log2(i + 2), 0);
  const ideal = gain(
    positives
      .map(([, g]) => g)
      .sort((a, b) => b - a)
      .slice(0, 10),
  );
  const first = ranked.findIndex((id) => (relevant[id] ?? 0) > 0);
  return {
    recall5:
      ranked.slice(0, 5).filter((id) => (relevant[id] ?? 0) > 0).length /
      positives.length,
    recall10:
      ranked.slice(0, 10).filter((id) => (relevant[id] ?? 0) > 0).length /
      positives.length,
    mrr: first < 0 ? 0 : 1 / (first + 1),
    ndcg10: gain(ranked.slice(0, 10).map((id) => relevant[id] ?? 0)) / ideal,
  };
}

export const SELECTION_VERSION = "evidence-1";
export function selectionConfig(profile, env = process.env) {
  const calibrated = profile?.provider === "google" && profile?.model === "gemini-embedding-2" && profile?.dimensions === 1536;
  const minCosine = Number(env.AI_SEARCH_MIN_COSINE ?? (calibrated ? 0.68 : 1));
  if (!Number.isFinite(minCosine) || minCosine < 0 || minCosine > 1) throw new Error("Invalid semantic floor");
  return { minCosine, version: SELECTION_VERSION, calibratedProfile: calibrated };
}
export function selectResults(lists, query, { limit = 50, minCosine = 0.68 } = {}) {
  const valid = lists.map(rows => rows.flatMap(row => {
    const start = row.metadata?.start ?? 0;
    const block = interpretMessage(row).find(b => b.searchable && b.start <= start && b.end > start);
    if (!block) return [];
    return [{ ...row, importance: row.metadata?.interpretation?.version === INTERPRETATION_VERSION ? row.importance : Math.min(row.importance ?? 1, block.importance),
      contentType: row.contentType ?? block.contentType, classificationReason: row.metadata?.interpretation?.reason ?? block.reason }];
  }));
  const fused = reciprocalRankFusion(valid, 60, [1, 0.5, 1, 1]);
  const maxRankScore = fused[0]?.score || 1;
  const grouped = new Map();
  for (const row of fused) {
    const lexical = lexicalEvidence(query, row.snippet ?? row.body ?? "");
    const similarity = Number.isFinite(row.distance) ? 1 - row.distance : null;
    // Weak OR-keyword coincidences must not fill the page when vectors are unrelated.
    if (!(similarity !== null && similarity >= minCosine) && !lexical.exact && lexical.coverage < 0.5) continue;
    const evidence = { similarity, lexicalCoverage: lexical.coverage, exact: lexical.exact, rrf: row.score };
    const score = row.importance * (0.45 * row.score / maxRankScore + 0.4 * Math.max(0, similarity ?? 0) + 0.15 * lexical.coverage);
    const key = JSON.stringify([row.sessionId, row.role, row.metadata?.contextSources?.[0]?.messageId ?? null, row.snippet ?? row.body]);
    const candidate = { ...row, score, evidence, occurrences: [{ messageId: row.id, occurredAt: row.occurredAt }] };
    const previous = grouped.get(key);
    if (!previous) grouped.set(key, candidate);
    else {
      const occurrences = [...previous.occurrences, ...candidate.occurrences];
      grouped.set(key, { ...(score > previous.score ? candidate : previous), occurrences });
    }
  }
  const pool = [...grouped.values()], selected = [], counts = new Map();
  while (selected.length < limit && pool.length) {
    // Soft preference allows all genuinely relevant messages from one session to survive.
    const adjusted = row => row.score / (1 + 0.15 * (counts.get(row.sessionId) ?? 0));
    pool.sort((a, b) => adjusted(b) - adjusted(a) || a.id.localeCompare(b.id));
    const row = pool.shift(); selected.push(row);
    counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
  }
  return selected;
}
