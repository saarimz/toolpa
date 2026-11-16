/** Nearest-rank percentile. `p` is 0–100. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile needs at least one sample');
  if (!(p >= 0) || p > 100) throw new Error('percentile must be from 0 to 100');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? 0;
}
