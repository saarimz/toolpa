import { el } from '@elemaudio/core';
import { sha256Hex, type NoteEvent } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { renderNode } from './offline.ts';
import { encodeWav, type WavFormat } from './wav.ts';

function countUnique(node: unknown, kind: string, seen = new Set<number>()): number {
  if (!node || typeof node !== 'object') return 0;
  const record = node as { hash?: number; kind?: string; hd?: unknown; tl?: unknown; children?: unknown };
  if ('hd' in record || 'tl' in record) return countUnique(record.hd, kind, seen) + countUnique(record.tl, kind, seen);
  if (typeof record.hash === 'number') {
    if (seen.has(record.hash)) return 0;
    seen.add(record.hash);
  }
  const here = record.kind === kind ? 1 : 0;
  return here + countUnique(record.children, kind, seen);
}

export const OSCILLATORS = ['cycle', 'saw', 'square', 'triangle', 'noise', 'blepsaw'] as const;
export type Oscillator = (typeof OSCILLATORS)[number];
export type FilterMode = 'lowpass' | 'highpass' | 'bandpass' | 'ladder';

export interface SynthVoice {
  attackSeconds: number;
  decaySeconds: number;
  sustain: number;
  releaseSeconds: number;
}

export interface Polysynth {
  sampleRate: number;
  oscillator: Oscillator;
  voice: SynthVoice;
  filter: { mode: FilterMode; cutoffHz: number; q: number };
  lfoHz: number;
  lfoDepthHz: number;
  maxVoices: number;
  notes: NoteEvent[];
}

export class SynthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SynthError';
  }
}

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function oscillator(type: Oscillator, frequency: number) {
  if (!OSCILLATORS.includes(type)) throw new SynthError('SYNTH_OSC', 'SYNTH_OSC: unknown oscillator');
  if (type === 'noise') return el.noise({ seed: 11, key: 'noise' });
  if (!(frequency > 0) || frequency > 20000) throw new SynthError('SYNTH_OSC', 'SYNTH_OSC: frequency must be inside 0..20000 Hz');
  if (type === 'saw') return el.saw(frequency);
  if (type === 'square') return el.square(frequency);
  if (type === 'triangle') return el.triangle(frequency);
  if (type === 'blepsaw') return el.blepsaw(frequency);
  return el.cycle(frequency);
}

function gateFor(note: NoteEvent, sampleRate: number, index: number) {
  const start = note.startSeconds * sampleRate;
  const end = (note.startSeconds + note.durationSeconds) * sampleRate;
  return el.sparseq2(
    {
      key: `gate-${index}`,
      seq: [
        { value: note.velocity / 127, time: start },
        { value: 0, time: end },
      ],
    },
    el.time(),
  );
}

function filterNode(input: ReturnType<typeof el.cycle>, synth: Polysynth) {
  const { mode, cutoffHz, q } = synth.filter;
  if (!(cutoffHz >= 20) || cutoffHz > 20000 || !(q > 0) || q > 20) {
    throw new SynthError('SYNTH_FILTER', 'SYNTH_FILTER: cutoff is 20..20000 Hz and q is 0..20');
  }
  const cutoff = synth.lfoDepthHz === 0 ? cutoffHz : el.add(cutoffHz, el.mul(synth.lfoDepthHz, el.cycle(synth.lfoHz)));
  if (mode === 'ladder') {
    let node = input;
    for (let pole = 0; pole < 4; pole += 1) node = el.svf({ key: `ladder-${pole}`, mode: 'lowpass' }, cutoff, q, node);
    return node;
  }
  return el.svf({ key: 'filter', mode }, cutoff, q, input);
}

export function lowerPolysynth(synth: Polysynth, trace?: Trace) {
  if (synth.notes.length < 1 || synth.notes.length > synth.maxVoices) {
    throw new SynthError('SYNTH_VOICES', 'SYNTH_VOICES: notes must fit in maxVoices');
  }
  const voices = synth.notes.map((note, index) => {
    const envelope = el.adsr(synth.voice.attackSeconds, synth.voice.decaySeconds, synth.voice.sustain, synth.voice.releaseSeconds, gateFor(note, synth.sampleRate, index));
    return el.mul(envelope, oscillator(synth.oscillator, midiHz(note.midi)));
  });
  const sum = voices.length === 1 ? voices[0] : el.add(...voices);
  const filtered = el.dcblock(filterNode(sum as ReturnType<typeof el.cycle>, synth));
  const svf = countUnique(filtered, 'svf');
  const expected = synth.filter.mode === 'ladder' ? 4 : 1;
  if (svf !== expected) throw new SynthError('SYNTH_FILTER', `SYNTH_FILTER: mounted ${svf} filters, expected ${expected}`);
  trace?.event('synth.osc', { oscillator: synth.oscillator, voices: voices.length, mode: synth.filter.mode });
  return { node: filtered, svf };
}

export async function renderPolysynth(
  input: { synth: Polysynth; durationSeconds: number; format?: WavFormat },
  trace?: Trace,
) {
  if (!(input.durationSeconds > 0) || input.durationSeconds > 5) {
    throw new SynthError('SYNTH_DURATION', 'SYNTH_DURATION: duration must be inside 0..5 seconds');
  }
  const { node, svf } = lowerPolysynth(input.synth, trace);
  const frames = Math.round(input.durationSeconds * input.synth.sampleRate);
  const pcm = await renderNode(node, { sampleRate: input.synth.sampleRate, frames, trace });
  let sum = 0;
  let peak = 0;
  for (const sample of pcm) {
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / pcm.length);
  const hash = await sha256Hex(JSON.stringify(input.synth));
  const format = input.format ?? 'float32';
  const wav = encodeWav(pcm, input.synth.sampleRate, { format, documentHash: hash });
  trace?.event('synth.render', { hash, svf, frames, peak, rms });
  return { pcm, wav, wavSha256: await sha256Hex(wav), hash, svf, peak, rms };
}

const demo: Polysynth = {
  sampleRate: 44100,
  oscillator: 'blepsaw',
  voice: { attackSeconds: 0.005, decaySeconds: 0.04, sustain: 0.7, releaseSeconds: 0.03 },
  filter: { mode: 'lowpass', cutoffHz: 1200, q: 0.8 },
  lfoHz: 5,
  lfoDepthHz: 200,
  maxVoices: 4,
  notes: [
    { midi: 60, startSeconds: 0, durationSeconds: 0.2, velocity: 100 },
    { midi: 67, startSeconds: 0.02, durationSeconds: 0.18, velocity: 80 },
  ],
};

export async function synthSelfCheck(): Promise<{ hash: string; svf: number; peak: number; rms: number }> {
  const rendered = await renderPolysynth({ synth: demo, durationSeconds: 0.25 });
  return { hash: rendered.wavSha256, svf: rendered.svf, peak: rendered.peak, rms: rendered.rms };
}
