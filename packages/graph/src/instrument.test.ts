import { describe, expect, it } from 'vitest';
import { allocateVoices, parseInstrument } from './instrument.ts';

const tone = { type: 'tone' as const, cutoffHz: 8000, q: 0.7071067811865476, gain: 0.25 };

function note(midi: number, startSeconds: number, durationSeconds = 1) {
  return { midi, startSeconds, durationSeconds, velocity: 100 };
}

describe('instrument voices', () => {
  it('drops the oldest overlapping note when the voice limit is full', () => {
    const allocated = allocateVoices([note(60, 0), note(64, 0.1), note(67, 0.2)], 2);
    expect(allocated.stolen.map((item) => item.midi)).toEqual([60]);
    expect(allocated.sounding.map((item) => item.midi)).toEqual([64, 67]);
  });

  it('keeps notes that do not overlap', () => {
    const allocated = allocateVoices([note(60, 0, 0.1), note(62, 0.1, 0.1)], 1);
    expect(allocated.stolen).toEqual([]);
    expect(allocated.sounding).toHaveLength(2);
  });

  it('rejects a note outside the MIDI range', () => {
    expect(() =>
      parseInstrument({
        kind: 'instrument',
        version: 1,
        sampleRate: 44100,
        voice: { type: 'sine', attackSeconds: 0.01, decaySeconds: 0.05, sustain: 0.7, releaseSeconds: 0.05 },
        maxVoices: 4,
        notes: [note(128, 0)],
        effect: tone,
      }),
    ).toThrow(/midi/);
  });
});
