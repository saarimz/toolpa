import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { buildSine, renderNode } from './offline.ts';
import { applyTone } from './tone.ts';

const frames = 44100;

function rms(pcm: Float32Array): number {
  let energy = 0;
  const start = Math.floor(pcm.length * 0.25);
  for (let i = start; i < pcm.length; i += 1) energy += (pcm[i] ?? 0) ** 2;
  return Math.sqrt(energy / (pcm.length - start));
}

describe('tone effect', () => {
  it('runs lowpass then gain and attenuates a tone above the cutoff', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const source = buildSine({ type: 'sine', frequencyHz: 4000 });
    const open = await renderNode(
      applyTone(source, { type: 'tone', cutoffHz: 12000, q: 0.7071067811865476, gain: 0.8 }, trace),
      { sampleRate: 44100, frames },
    );
    const closed = await renderNode(
      applyTone(source, { type: 'tone', cutoffHz: 200, q: 0.7071067811865476, gain: 0.8 }),
      { sampleRate: 44100, frames },
    );
    const openRms = rms(open);
    const closedRms = rms(closed);
    expect(openRms).toBeGreaterThan(0.2);
    expect(closedRms).toBeLessThan(openRms * 0.2);
    const again = await renderNode(
      applyTone(buildSine({ type: 'sine', frequencyHz: 4000 }), { type: 'tone', cutoffHz: 200, q: 0.7071067811865476, gain: 0.8 }),
      { sampleRate: 44100, frames },
    );
    expect(again).toEqual(closed);
    expect(lines.map((line) => JSON.parse(line.trim())).some((record) => record.name === 'effect.tone')).toBe(true);
  });
});
