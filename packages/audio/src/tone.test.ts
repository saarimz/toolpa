import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { buildNoise, buildSine, renderNode } from './offline.ts';
import { applyTone, countNodes } from './tone.ts';

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

  it('mounts the lowpass filter exactly once', () => {
    const filtered = applyTone(buildSine({ type: 'sine', frequencyHz: 440 }), {
      type: 'tone',
      cutoffHz: 800,
      q: 0.7071067811865476,
      gain: 1,
    });
    expect(countNodes(filtered, 'svf')).toBe(1);
    expect(countNodes(buildSine({ type: 'sine', frequencyHz: 440 }), 'svf')).toBe(0);
  });

  it('puts at least 24 dB less energy above 3.2 kHz than in the passband', async () => {
    const sampleRate = 48000;
    const frames = 8192;
    const pcm = await renderNode(
      applyTone(buildNoise({ type: 'noise', seed: 3 }), {
        type: 'tone',
        cutoffHz: 800,
        q: 0.7071067811865476,
        gain: 1,
      }),
      { sampleRate, frames },
    );
    const settled = pcm.subarray(1024);
    const pass = bandEnergy(settled, sampleRate, 100, 600);
    const stop = bandEnergy(settled, sampleRate, 3200, 6400);
    expect(pass).toBeGreaterThan(0);
    expect(stop).toBeLessThan(pass * 10 ** (-24 / 10));
  });
});

function bandEnergy(pcm: Float32Array, sampleRate: number, lowHz: number, highHz: number): number {
  const n = pcm.length;
  const k0 = Math.max(1, Math.ceil((lowHz * n) / sampleRate));
  const k1 = Math.min(Math.floor(n / 2) - 1, Math.floor((highHz * n) / sampleRate));
  let energy = 0;
  let bins = 0;
  for (let k = k0; k <= k1; k += 1) {
    let real = 0;
    let imag = 0;
    const omega = (2 * Math.PI * k) / n;
    for (let i = 0; i < n; i += 1) {
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
      const sample = (pcm[i] ?? 0) * window;
      real += sample * Math.cos(omega * i);
      imag -= sample * Math.sin(omega * i);
    }
    energy += real * real + imag * imag;
    bins += 1;
  }
  return energy / bins;
}
