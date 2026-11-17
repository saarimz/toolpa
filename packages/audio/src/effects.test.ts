import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { EffectError, renderEffectSuite, samplesForBeats } from './effects.ts';

describe('effects', () => {
  it('maps a beat at 120 bpm onto half a second of samples', () => {
    expect(samplesForBeats(120, 1, 44100)).toBe(22050);
    expect(() => samplesForBeats(120, 1, 44100)).not.toThrow();
    expect(() => samplesForBeats(Number.NaN, 1, 44100)).toThrow(EffectError);
  });

  it('renders delay, reverb, dynamics, EQ, distortion, and chorus', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const first = await renderEffectSuite(trace);
    const second = await renderEffectSuite();
    expect(first.delay.wavSha256).toBe(second.delay.wavSha256);
    expect(first.delay.wavSha256).toBe('4b4e02729a27b608110b1567e57caf9b672ebdc3d264c8f245f4e12cd35d7842');
    expect(first.reverb.wavSha256).toBe('46b1bb39bfc2a6993cd7ed1a22d9752d4f946f885ac1410cc85fae7030d89c9d');
    expect(first.delay.wavSha256).not.toBe(first.dry.wavSha256);
    expect(first.reverb.wavSha256).not.toBe(first.dry.wavSha256);
    expect(first.distort.wavSha256).not.toBe(first.dry.wavSha256);
    expect(first.chorus.wavSha256).not.toBe(first.dry.wavSha256);
    expect(first.eq.wavSha256).not.toBe(first.dry.wavSha256);
    for (const rendered of [first.delay, first.reverb, first.compressor, first.limiter, first.eq, first.distort, first.chorus]) {
      expect(rendered.peak).toBeGreaterThan(0.01);
      expect(rendered.rms).toBeGreaterThan(0.001);
      expect(Number.isFinite(rendered.rms)).toBe(true);
    }
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string; fields?: { effect?: string } });
    expect(names.map((record) => record.name)).toContain('effect.apply');
  });
});
