import type { Trace } from '@toolpa/trace';
import type { ToneEffect } from './chain.ts';
import { canonicalize, sha256Hex } from './codec.ts';
import { ChainError } from './chain.ts';

export const INSTRUMENT_KIND = 'instrument' as const;
export const INSTRUMENT_VERSION = 1 as const;

export interface NoteEvent {
  midi: number;
  startSeconds: number;
  durationSeconds: number;
  velocity: number;
}

export interface VoiceSpec {
  type: 'sine';
  attackSeconds: number;
  decaySeconds: number;
  sustain: number;
  releaseSeconds: number;
}

export interface Instrument {
  kind: typeof INSTRUMENT_KIND;
  version: typeof INSTRUMENT_VERSION;
  sampleRate: number;
  voice: VoiceSpec;
  maxVoices: number;
  notes: NoteEvent[];
  effect: ToneEffect;
}

function numberIn(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ChainError('range', `${label} must be a finite number from ${min} to ${max}`);
  }
  return value;
}

function integerIn(value: unknown, label: string, min: number, max: number): number {
  const n = numberIn(value, label, min, max);
  if (!Number.isInteger(n)) throw new ChainError('range', `${label} must be an integer`);
  return n;
}

function parseNote(value: unknown, index: number): NoteEvent {
  if (!value || typeof value !== 'object') throw new ChainError('note', `note ${index} is required`);
  const record = value as Record<string, unknown>;
  const durationSeconds = numberIn(record.durationSeconds, `notes[${index}].durationSeconds`, 0.001, 30);
  return {
    midi: integerIn(record.midi, `notes[${index}].midi`, 0, 127),
    startSeconds: numberIn(record.startSeconds, `notes[${index}].startSeconds`, 0, 30),
    durationSeconds,
    velocity: integerIn(record.velocity, `notes[${index}].velocity`, 1, 127),
  };
}

function parseEffect(effect: unknown): ToneEffect {
  if (!effect || typeof effect !== 'object') throw new ChainError('effect', 'effect is required');
  const record = effect as Record<string, unknown>;
  if (record.type !== 'tone') throw new ChainError('effect', 'the instrument effect must be tone');
  return {
    type: 'tone',
    cutoffHz: numberIn(record.cutoffHz, 'cutoffHz', 20, 20_000),
    q: numberIn(record.q, 'q', 0.1, 18),
    gain: numberIn(record.gain, 'gain', 0, 1),
  };
}

export function parseInstrument(input: unknown): Instrument {
  if (!input || typeof input !== 'object') throw new ChainError('instrument', 'instrument must be an object');
  const record = input as Record<string, unknown>;
  if (record.kind !== INSTRUMENT_KIND) throw new ChainError('kind', 'kind must be "instrument"');
  if (record.version !== INSTRUMENT_VERSION) throw new ChainError('version', 'version must be 1');
  if (!record.voice || typeof record.voice !== 'object') throw new ChainError('voice', 'voice is required');
  const voice = record.voice as Record<string, unknown>;
  if (voice.type !== 'sine') throw new ChainError('voice', 'voice type must be sine');
  if (!Array.isArray(record.notes)) throw new ChainError('note', 'notes must be a list');
  if (record.notes.length > 64) throw new ChainError('note', 'an instrument accepts at most 64 notes');
  return {
    kind: INSTRUMENT_KIND,
    version: INSTRUMENT_VERSION,
    sampleRate: integerIn(record.sampleRate, 'sampleRate', 8_000, 96_000),
    voice: {
      type: 'sine',
      attackSeconds: numberIn(voice.attackSeconds, 'attackSeconds', 0, 2),
      decaySeconds: numberIn(voice.decaySeconds, 'decaySeconds', 0, 4),
      sustain: numberIn(voice.sustain, 'sustain', 0, 1),
      releaseSeconds: numberIn(voice.releaseSeconds, 'releaseSeconds', 0, 4),
    },
    maxVoices: integerIn(record.maxVoices, 'maxVoices', 1, 8),
    notes: record.notes.map((note, index) => parseNote(note, index)),
    effect: parseEffect(record.effect),
  };
}

export function allocateVoices(notes: readonly NoteEvent[], maxVoices: number): { sounding: NoteEvent[]; stolen: NoteEvent[] } {
  const ordered = [...notes].sort((left, right) => left.startSeconds - right.startSeconds || left.midi - right.midi);
  const active: NoteEvent[] = [];
  const sounding: NoteEvent[] = [];
  const stolen: NoteEvent[] = [];
  for (const note of ordered) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const current = active[index];
      if (!current) continue;
      if (current.startSeconds + current.durationSeconds <= note.startSeconds) active.splice(index, 1);
    }
    if (active.length >= maxVoices) {
      let oldest = 0;
      for (let index = 1; index < active.length; index += 1) {
        const current = active[index];
        const first = active[oldest];
        if (current && first && current.startSeconds < first.startSeconds) oldest = index;
      }
      const victim = active.splice(oldest, 1)[0];
      if (!victim) continue;
      const soundingIndex = sounding.indexOf(victim);
      if (soundingIndex >= 0) sounding.splice(soundingIndex, 1);
      stolen.push(victim);
    }
    active.push(note);
    sounding.push(note);
  }
  return { sounding, stolen };
}

export async function hashInstrument(
  input: unknown,
  trace?: Trace,
): Promise<{ instrument: Instrument; hash: string; canonical: string }> {
  const instrument = parseInstrument(input);
  const canonical = canonicalize(instrument);
  const hash = await sha256Hex(canonical);
  trace?.event('ir.hash', { hash, kind: instrument.kind, source: 'sine' });
  return { instrument, hash, canonical };
}
