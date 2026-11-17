import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { renderSource } from './index.ts';
import { measure, traceMeter } from './meter.ts';

describe('meter', () => {
  it('computes peak and RMS and emits them', () => {
    const summary = measure(new Float32Array([0, 0.5, -1, 0.5]));
    expect(summary.peak).toBe(1);
    expect(summary.rms).toBeCloseTo(Math.sqrt(0.375), 6);
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    traceMeter(summary, trace);
    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.find((record) => record.name === 'meter.summary')?.fields.peak).toBe(1);
    expect(records.find((record) => record.name === 'meter.rms')?.unit).toBe('amp');
  });

  it('sees a rendered sine', async () => {
    const pcm = await renderSource({ type: 'sine', frequencyHz: 440 }, { sampleRate: 44100, frames: 4410 });
    const summary = measure(pcm);
    expect(summary.peak).toBeGreaterThan(0.9);
    expect(summary.rms).toBeGreaterThan(0.5);
    expect(summary.rms).toBeLessThan(summary.peak);
  });
});
