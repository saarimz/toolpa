import { describe, expect, it } from 'vitest';
import { percentile } from '../../../scripts/percentiles.ts';

describe('percentiles', () => {
  it('reports nearest-rank p50 and p95', () => {
    const values = [10, 1, 8, 3, 5, 9, 2, 7, 4, 6];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile([4], 95)).toBe(4);
  });
});
