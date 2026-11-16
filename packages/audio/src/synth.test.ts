import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { SynthError, renderPolysynth, type Polysynth } from './synth.ts';

const voice = { attackSeconds: 0.005, decaySeconds: 0.03, sustain: 0.8, releaseSeconds: 0.02 };
const note = [{ midi: 69, startSeconds: 0, durationSeconds: 0.12, velocity: 110 }];

function synth(patch: Partial<Polysynth>): Polysynth {
  return {
    sampleRate: 44100,
    oscillator: 'blepsaw',
    voice,
    filter: { mode: 'lowpass', cutoffHz: 1800, q: 0.7 },
    lfoHz: 0,
    lfoDepthHz: 0,
    maxVoices: 4,
    notes: note,
    ...patch,
  };
}

describe('polysynth', () => {
  it('renders every oscillator through one filter, twice, with a finite peak', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    for (const oscillator of ['cycle', 'saw', 'square', 'triangle', 'noise', 'blepsaw'] as const) {
      const first = await renderPolysynth({ synth: synth({ oscillator }), durationSeconds: 0.15 }, trace);
      const second = await renderPolysynth({ synth: synth({ oscillator }), durationSeconds: 0.15 });
      expect(first.wavSha256).toBe(second.wavSha256);
      expect(first.svf).toBe(1);
      expect(first.peak).toBeGreaterThan(0.01);
      expect(first.rms).toBeGreaterThan(0.001);
    }
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('synth.osc');
    expect(names).toContain('synth.render');
    const blep = await renderPolysynth({ synth: synth({ oscillator: 'blepsaw' }), durationSeconds: 0.15 });
    expect(blep.wavSha256).toBe('a2ecfe515330215f72716d5dafb12ad8a950075082bd78bcb86131e2e5d8291c');
  });

  it('mounts four poles for the ladder and moves the spectrum with the LFO', async () => {
    const ladder = await renderPolysynth({ synth: synth({ filter: { mode: 'ladder', cutoffHz: 900, q: 0.6 } }), durationSeconds: 0.15 });
    expect(ladder.svf).toBe(4);
    const still = await renderPolysynth({ synth: synth({}), durationSeconds: 0.15 });
    const moving = await renderPolysynth({
      synth: synth({ lfoHz: 6, lfoDepthHz: 400 }),
      durationSeconds: 0.15,
    });
    expect(moving.wavSha256).not.toBe(still.wavSha256);
    expect(() => synth({ filter: { mode: 'lowpass', cutoffHz: Number.NaN, q: 0.7 } })).not.toThrow();
    await expect(renderPolysynth({ synth: synth({ filter: { mode: 'lowpass', cutoffHz: Number.NaN, q: 0.7 } }), durationSeconds: 0.05 })).rejects.toBeInstanceOf(SynthError);
  });
});
