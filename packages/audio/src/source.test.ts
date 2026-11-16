import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { renderSource } from './index.ts';

const frames = 4410;

describe('elementary sources', () => {
  it('renders a sine the same way twice and keeps it in range', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const a = await renderSource({ type: 'sine', frequencyHz: 440 }, { sampleRate: 44100, frames }, trace);
    const b = await renderSource({ type: 'sine', frequencyHz: 440 }, { sampleRate: 44100, frames });
    expect(a).toEqual(b);
    let peak = 0;
    for (let i = 0; i < a.length; i += 1) peak = Math.max(peak, Math.abs(a[i] ?? 0));
    expect(peak).toBeGreaterThan(0.9);
    expect(peak).toBeLessThanOrEqual(1);
    expect(lines.map((line) => JSON.parse(line.trim())).some((record) => record.name === 'source.rendered')).toBe(true);
  });

  it('renders seeded noise deterministically and changes with the seed', async () => {
    const a = await renderSource({ type: 'noise', seed: 7 }, { sampleRate: 44100, frames });
    const b = await renderSource({ type: 'noise', seed: 7 }, { sampleRate: 44100, frames });
    const c = await renderSource({ type: 'noise', seed: 8 }, { sampleRate: 44100, frames });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    let energy = 0;
    for (let i = 0; i < a.length; i += 1) energy += (a[i] ?? 0) ** 2;
    expect(Math.sqrt(energy / a.length)).toBeGreaterThan(0.1);
  });
});
