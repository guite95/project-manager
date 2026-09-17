export function reciprocalRankFusion(lists, k = 60) {
  const scores = new Map();
  for (const list of lists) {
    const seen = new Set();
    let rank = 0;
    for (const row of list) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rank++;
      const current = scores.get(row.id) ?? { ...row, score: 0 };
      current.score += (row.importance ?? 1) / (k + rank);
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
