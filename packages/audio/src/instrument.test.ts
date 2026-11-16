import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { countNodes } from './tone.ts';
import { lowerInstrument, renderInstrument } from './instrument.ts';

const sineGolden = JSON.parse(readFileSync(new URL('./../goldens/sine.json', import.meta.url), 'utf8')) as { hash: string };

const instrument = {
  kind: 'instrument',
  version: 1,
  sampleRate: 44100,
  voice: { type: 'sine', attackSeconds: 0.005, decaySeconds: 0.04, sustain: 0.8, releaseSeconds: 0.03 },
  maxVoices: 4,
  notes: [
    { midi: 60, startSeconds: 0, durationSeconds: 0.25, velocity: 100 },
    { midi: 64, startSeconds: 0.05, durationSeconds: 0.25, velocity: 90 },
  ],
  effect: { type: 'tone', cutoffHz: 4000, q: 0.7071067811865476, gain: 0.4 },
};

describe('instrument render', () => {
  it('renders two notes through one lowpass and matches a second render', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const first = await renderInstrument({ instrument, durationSeconds: 0.4 }, trace);
    const second = await renderInstrument({ instrument, durationSeconds: 0.4 });
    expect(first.svf).toBe(1);
    expect(countNodes(lowerInstrument(first.instrument).node, 'svf')).toBe(1);
    expect(first.wav).toEqual(second.wav);
    expect(first.hash).toBe(second.hash);
    expect(Math.max(...first.pcm)).toBeGreaterThan(0.01);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('voice.allocate');
    expect(names).toContain('instrument.render');
  });

  it('records a stolen voice', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const crowded = {
      ...instrument,
      maxVoices: 1,
      notes: [
        { midi: 60, startSeconds: 0, durationSeconds: 1, velocity: 100 },
        { midi: 67, startSeconds: 0.1, durationSeconds: 0.2, velocity: 100 },
      ],
    };
    const rendered = await renderInstrument({ instrument: crowded, durationSeconds: 0.3 }, trace);
    expect(rendered.stolen.map((note) => note.midi)).toEqual([60]);
    expect(rendered.sounding.map((note) => note.midi)).toEqual([67]);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('voice.steal');
  });

  it('does not move the slice 1 sine golden', () => {
    expect(sineGolden.hash).toBe('59d86cf3314f9c8c44bd7b2523a400c4191e27eed50e80434d753d4616dc94b8');
  });
});
