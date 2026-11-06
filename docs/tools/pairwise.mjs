// Deterministic greedy covering array: every pair of factor values is retained.
export function pairwise(factors) {
  const entries = Object.entries(factors);
  let rows = [{}];
  for (const [key, values] of entries) rows = rows.flatMap(row => values.map(value => ({...row, [key]: value})));
  const pairs = row => entries.flatMap(([a], i) => entries.slice(i + 1).map(([b]) => JSON.stringify([a, row[a], b, row[b]])));
  const candidates = rows.map(row => ({row, pairs: pairs(row)}));
  const uncovered = new Set(candidates.flatMap(candidate => candidate.pairs));
  const selected = [];
  while (uncovered.size) {
    let best, score = -1;
    for (const candidate of candidates) {
      const count = candidate.pairs.reduce((sum, pair) => sum + uncovered.has(pair), 0);
      if (count > score) { best = candidate; score = count; }
    }
    selected.push(best.row);
    for (const pair of best.pairs) uncovered.delete(pair);
  }
  return selected;
}
