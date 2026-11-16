import { el } from '@elemaudio/core';
import type { NoteEvent } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import {
  chorusNode,
  compressorNode,
  delayNode,
  distortNode,
  eqNode,
  limiterNode,
  reverbImpulse,
  reverbNode,
} from './effects.ts';
import { renderNode } from './offline.ts';
import { renderZone, type SampleZone } from './sampler.ts';
import { lowerPolysynth, type FilterMode, type Oscillator, type Polysynth } from './synth.ts';

export const PROMPT_EFFECTS = ['dry', 'delay', 'reverb', 'compressor', 'limiter', 'eq', 'distort', 'chorus'] as const;
export type PromptEffect = (typeof PROMPT_EFFECTS)[number];

export interface PromptGraphNote {
  midi: number;
  step: number;
  velocity: number;
}

export interface PromptGraph {
  oscillator: Oscillator;
  voice: { attackSeconds: number; decaySeconds: number; sustain: number; releaseSeconds: number };
  filter: { mode: FilterMode; cutoffHz: number; q: number };
  lfoHz: number;
  lfoDepthHz: number;
  effect: PromptEffect;
  sampler: boolean;
  notes: readonly PromptGraphNote[];
}

const ZONE_SHA = 'c'.repeat(64);

function zonePcm(): Float32Array {
  const pcm = new Float32Array(128);
  for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((index / pcm.length) * Math.PI * 2) * 0.45;
  return pcm;
}

function synthFor(doc: PromptGraph, holdSeconds: number): Polysynth {
  const notes = doc.notes.slice(0, 8).map((note) => ({
    midi: note.midi,
    startSeconds: note.step * 0.25,
    durationSeconds: holdSeconds,
    velocity: note.velocity,
  }));
  return {
    sampleRate: 44100,
    oscillator: doc.oscillator,
    voice: doc.voice,
    filter: doc.filter,
    lfoHz: doc.lfoHz,
    lfoDepthHz: doc.lfoDepthHz,
    maxVoices: Math.max(1, notes.length),
    notes,
  };
}

type Node = ReturnType<typeof el.cycle>;

function applyEffect(input: Node, effect: PromptEffect): { node: Node; vfs?: Record<string, Float32Array> } {
  if (effect === 'delay') return { node: delayNode(input, 120, 0.25, 0.3, 44100) };
  if (effect === 'reverb') return { node: reverbNode(input), vfs: { 'reverb-ir': reverbImpulse() } };
  if (effect === 'compressor') return { node: compressorNode(input) };
  if (effect === 'limiter') return { node: limiterNode(input) };
  if (effect === 'eq') return { node: eqNode(input) };
  if (effect === 'distort') return { node: distortNode(input, 4) };
  if (effect === 'chorus') return { node: chorusNode(input, 44100) };
  return { node: input };
}

export function lowerPromptGraph(doc: PromptGraph, holdSeconds = 1): { node: Node; vfs?: Record<string, Float32Array> } {
  const lowered = lowerPolysynth(synthFor(doc, holdSeconds));
  let node = lowered.node as Node;
  const vfs: Record<string, Float32Array> = {};
  if (doc.sampler) {
    const pcm = zonePcm();
    const position = el.div(el.mul(pcm.length, el.phasor(44100 / pcm.length)), pcm.length);
    const table = el.table({ path: ZONE_SHA, channels: 1, key: 'prompt-zone' }, position);
    node = el.add(el.mul(0.6, node), el.mul(0.4, table)) as Node;
    vfs[ZONE_SHA] = pcm;
  }
  const effected = applyEffect(node, doc.effect);
  return { node: effected.node, vfs: { ...vfs, ...effected.vfs } };
}

export async function renderPromptGraph(doc: PromptGraph, trace?: Trace): Promise<{ peak: number; nan: boolean }> {
  const lowered = lowerPromptGraph(doc, 0.08);
  const frames = Math.round(0.12 * 44100);
  const pcm = await renderNode(lowered.node, { sampleRate: 44100, frames, vfs: lowered.vfs, trace });
  let peak = 0;
  let nan = false;
  for (const sample of pcm) {
    if (!Number.isFinite(sample)) nan = true;
    else peak = Math.max(peak, Math.abs(sample));
  }
  if (doc.sampler) {
    const zone: SampleZone = { sha256: ZONE_SHA, lokey: 0, hikey: 127, lovel: 0, hivel: 127, loopStart: 0, loopEnd: 64 };
    const sampled = await renderZone(zone, zonePcm(), trace);
    if (!Number.isFinite(sampled.peak)) nan = true;
    else peak = Math.max(peak, sampled.peak);
  }
  return { peak, nan };
}

export function promptHoldNotes(doc: PromptGraph, holdSeconds: number): NoteEvent[] {
  return synthFor(doc, holdSeconds).notes;
}
