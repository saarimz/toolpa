import { beatToSeconds, renderInstrument } from '@toolpa/audio';
import type { Trace } from '@toolpa/trace';
import { notesFromPulses, schedulePattern } from './generate.ts';

const voice = { type: 'sine', attackSeconds: 0.005, decaySeconds: 0.02, sustain: 0.8, releaseSeconds: 0.02 };
const effect = { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.3 };

export function clipDocument(pulses: readonly number[], root: number, bpm: number) {
  const stepSeconds = beatToSeconds(0.5, bpm);
  const notes = schedulePattern(notesFromPulses(pulses, root), stepSeconds);
  const end = notes.reduce((max, note) => Math.max(max, note.startSeconds + note.durationSeconds), stepSeconds);
  return {
    stepSeconds,
    instrument: {
      kind: 'instrument',
      version: 1,
      sampleRate: 44100,
      voice,
      maxVoices: 4,
      notes,
      effect,
    },
    durationSeconds: Math.min(30, Math.max(0.25, end)),
  };
}

export async function launchClip(pulses: readonly number[], root: number, bpm: number, trace?: Trace) {
  const clip = clipDocument(pulses, root, bpm);
  trace?.event('transport.launch', { bpm, notes: clip.instrument.notes.length, stepSeconds: clip.stepSeconds });
  const rendered = await renderInstrument(
    { instrument: clip.instrument, durationSeconds: clip.durationSeconds },
    trace,
  );
  return { hash: rendered.hash, wav: rendered.wav, notes: clip.instrument.notes.length };
}
