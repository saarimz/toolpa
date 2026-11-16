import { hashChain } from '@toolpa/graph';
import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { LiveSession, clockDriftStalled, stalled } from './live.ts';

const chain = {
  kind: 'chain',
  version: 1,
  sampleRate: 48000,
  source: { type: 'sine', frequencyHz: 220 },
  effect: { type: 'tone', cutoffHz: 8000, q: 0.7071067811865476, gain: 0.25 },
};

describe('live stall detection', () => {
  it('counts a running context whose clock barely moves', () => {
    expect(stalled('running', 0.4, 0.01)).toBe(true);
    expect(stalled('running', 0.4, 0.3)).toBe(false);
    expect(stalled('suspended', 0.4, 0)).toBe(false);
    expect(stalled('running', 0.1, 0)).toBe(false);
  });

  it('emits exactly one live.stall when the audio clock misses a 300 ms block', async () => {
    expect(clockDriftStalled(48_000, 300, 0)).toBe(true);
    expect(clockDriftStalled(48_000, 300, 290)).toBe(false);
    expect(clockDriftStalled(48_000, 10, 0)).toBe(false);
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const session = new LiveSession(trace);
    expect(session.noteClock(300, 0, 48_000)).toBe(true);
    expect(session.noteClock(300, 0, 48_000)).toBe(false);
    const stalls = lines.map((line) => JSON.parse(line.trim())).filter((record) => record.name === 'live.stall');
    expect(stalls).toHaveLength(1);
    expect(stalls[0].fields).toMatchObject({ expectedMs: 300, observedMs: 0, driftMs: 300 });
    session.hash = (await hashChain(chain)).hash;
    expect(await session.considerSwap(chain)).toBe(true);
    expect(await session.considerSwap({ ...chain, source: { type: 'sine', frequencyHz: 441 } })).toBe(false);
    const swaps = lines.map((line) => JSON.parse(line.trim())).filter((record) => record.name === 'live.swap');
    expect(swaps).toHaveLength(1);
    expect(swaps[0].fields.noop).toBe(true);
  });
});
