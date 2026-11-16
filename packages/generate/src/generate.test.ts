import { describe, expect, it } from 'vitest';
import { renderInstrument } from '@toolpa/audio';
import { createTrace } from '@toolpa/trace';
import { GenerateError, LocalPromptProvider, RemotePromptProvider, euclidean, generateSelfCheck, notesFromPulses, schedulePattern } from './generate.ts';

describe('pattern and prompt generators', () => {
  it('rotates a 3-pulse bar onto the downbeat', () => {
    expect(euclidean(8, 3)).toEqual([1, 0, 0, 1, 0, 1, 0, 0]);
  });

  it('keeps a prompt stable and refuses a hosted model', () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const local = new LocalPromptProvider();
    const bass = local.generate('bass', trace);
    expect(bass).toEqual(local.generate('  Bass '));
    expect(bass).not.toEqual(local.generate('lead'));
    expect(() => new RemotePromptProvider().generate('bass')).toThrow(GenerateError);
    expect(() => new RemotePromptProvider().generate('bass')).toThrow(/NOT_CONFIGURED/);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('generate.prompt');
  });

  it('renders the scheduled pattern twice to the same bytes', async () => {
    const notes = schedulePattern(notesFromPulses(euclidean(8, 3), 48), 0.2);
    const instrument = {
      kind: 'instrument',
      version: 1,
      sampleRate: 44100,
      voice: { type: 'sine', attackSeconds: 0.005, decaySeconds: 0.02, sustain: 0.7, releaseSeconds: 0.02 },
      maxVoices: 2,
      notes,
      effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.3 },
    };
    const first = await renderInstrument({ instrument, durationSeconds: 1.2 });
    const second = await renderInstrument({ instrument, durationSeconds: 1.2 });
    expect(first.wav).toEqual(second.wav);
    expect(Math.max(...first.pcm)).toBeGreaterThan(0.01);
  });

  it('matches the browser self-check', () => {
    const check = generateSelfCheck();
    expect(check.pulses).toBe(3);
    expect(check.same).toBe(true);
    expect(check.remote).toBe('NOT_CONFIGURED');
    expect(check.first).toBeGreaterThan(0);
  });
});