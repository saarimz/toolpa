import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { COOKBOOK, cookbookSelfCheck, renderCookbook } from './cookbook.ts';

describe('cookbook', () => {
  it('loads and renders all 40 patches to one digest', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const first = await renderCookbook(trace);
    const second = await renderCookbook();
    expect(COOKBOOK.map((entry) => entry.name).length).toBe(new Set(COOKBOOK.map((entry) => entry.name)).size);
    expect(first.count).toBe(40);
    expect(first.hashes).toEqual(second.hashes);
    expect(first.minPeak).toBeGreaterThan(0.01);
    expect(new Set(first.hashes).size).toBe(40);
    expect(first.digest).toBe('c75d8acc8171858d0373456c916877e4c1d3bd20758951c6dcc60dd2e3f0d1f0');
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('cookbook.render');
    const check = await cookbookSelfCheck();
    expect(check.count).toBe(40);
    expect(check.digest).toBe(first.digest);
  }, 60_000);
});
