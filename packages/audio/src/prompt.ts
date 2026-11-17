import { el } from '@elemaudio/core';
import type { NoteEvent } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { chorusNode, compressorNode, delayNode, distortNode, eqNode, reverbImpulse, reverbNode } from './effects.ts';
import { renderNode } from './offline.ts';

export const PROMPT_EFFECTS = ['delay', 'reverb', 'chorus', 'distortion', 'eq', 'compressor'] as const;
export type PromptEffect = (typeof PROMPT_EFFECTS)[number];
export const PROMPT_WAVES = ['saw', 'square', 'triangle', 'sine', 'noise'] as const;
export type PromptWave = (typeof PROMPT_WAVES)[number];
export const LFO_TARGETS = ['cutoff', 'pitch', 'amp', 'pan'] as const;
export type LfoTarget = (typeof LFO_TARGETS)[number];

export interface PromptGraphNote {
  midi: number;
  step: number;
  velocity: number;
}

export interface PromptAdsr {
  attackSeconds: number;
  decaySeconds: number;
  sustain: number;
  releaseSeconds: number;
}

export interface PromptOscillator {
  wave: PromptWave;
  detuneCents: number;
  octave: number;
  level: number;
  unison: number;
}

export interface PromptLfo {
  rateHz: number;
  depth: number;
  target: LfoTarget;
}

export interface PromptEffectSpec {
  type: PromptEffect;
  params: { mix?: number; feedback?: number; time?: number; drive?: number; threshold?: number; ratio?: number };
}

export interface PromptGraph {
  voices: number;
  glideSeconds: number;
  oscillators: PromptOscillator[];
  amp: PromptAdsr;
  filter: {
    type: 'svf' | 'ladder';
    mode: 'lowpass' | 'highpass' | 'bandpass';
    cutoffHz: number;
    resonance: number;
    envelopeAmount: number;
    keytrack: number;
    adsr: PromptAdsr;
  };
  lfos: PromptLfo[];
  effects: PromptEffectSpec[];
  notes: readonly PromptGraphNote[];
}

type Node = ReturnType<typeof el.cycle>;

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function mix(nodes: Node[]): Node {
  const [first, ...rest] = nodes;
  if (!first) return el.mul(0, el.cycle(440));
  if (rest.length === 0) return first;
  return el.add(first, ...rest) as Node;
}

function wave(kind: PromptWave, frequency: Node | number, key: string): Node {
  const freq = frequency as number;
  if (kind === 'noise') return el.noise({ seed: 11, key });
  if (kind === 'saw') return el.blepsaw(freq);
  if (kind === 'square') return el.blepsquare(freq);
  if (kind === 'triangle') return el.bleptriangle(freq);
  return el.cycle(freq);
}

function gateFor(note: PromptGraphNote, holdSeconds: number, index: number): Node {
  const start = note.step * 0.25 * 44100;
  const end = (note.step * 0.25 + holdSeconds) * 44100;
  return el.sparseq2(
    { key: `gate-${index}`, seq: [{ value: note.velocity / 127, time: start }, { value: 0, time: end }] },
    el.time(),
  ) as Node;
}

function lfo(list: readonly PromptLfo[], target: LfoTarget): PromptLfo | undefined {
  return list.find((item) => item.target === target && item.depth > 0 && item.rateHz >= 0.05);
}

function legacyGraph(input: Record<string, unknown>): PromptGraph {
  const oscillator = input.oscillator === 'noise' ? 'noise' : input.oscillator === 'square' ? 'square' : input.oscillator === 'triangle' ? 'triangle' : input.oscillator === 'saw' || input.oscillator === 'blepsaw' ? 'saw' : 'sine';
  const voice = (input.voice ?? {}) as Record<string, number>;
  const filter = (input.filter ?? {}) as Record<string, unknown>;
  const effect = typeof input.effect === 'string' ? input.effect : 'dry';
  const mapped = effect === 'distort' ? 'distortion' : effect;
  return {
    voices: 8,
    glideSeconds: 0,
    oscillators: [{ wave: oscillator, detuneCents: 0, octave: 0, level: 0.45, unison: 1 }],
    amp: {
      attackSeconds: voice.attackSeconds ?? 0.01,
      decaySeconds: voice.decaySeconds ?? 0.1,
      sustain: voice.sustain ?? 0.7,
      releaseSeconds: voice.releaseSeconds ?? 0.08,
    },
    filter: {
      type: filter.mode === 'ladder' ? 'ladder' : 'svf',
      mode: filter.mode === 'highpass' || filter.mode === 'bandpass' ? filter.mode : 'lowpass',
      cutoffHz: typeof filter.cutoffHz === 'number' ? filter.cutoffHz : 1600,
      resonance: typeof filter.q === 'number' ? filter.q : 0.8,
      envelopeAmount: 0,
      keytrack: 0,
      adsr: { attackSeconds: 0.01, decaySeconds: 0.1, sustain: 0.4, releaseSeconds: 0.08 },
    },
    lfos: typeof input.lfoHz === 'number' && typeof input.lfoDepthHz === 'number' && input.lfoDepthHz > 0
      ? [{ rateHz: input.lfoHz, depth: Math.min(1, input.lfoDepthHz / 2000), target: 'cutoff' }]
      : [],
    effects: PROMPT_EFFECTS.includes(mapped as PromptEffect) ? [{ type: mapped as PromptEffect, params: { mix: 0.35 } }] : [],
    notes: Array.isArray(input.notes) ? (input.notes as PromptGraphNote[]) : [{ midi: 60, step: 0, velocity: 100 }],
  };
}

export function coercePromptGraph(input: PromptGraph | Record<string, unknown>): PromptGraph {
  const record = input as Record<string, unknown>;
  if (Array.isArray(record.oscillators)) return input as PromptGraph;
  return legacyGraph(record);
}

function applyEffects(input: Node, effects: readonly PromptEffectSpec[]): { node: Node; vfs?: Record<string, Float32Array> } {
  let node = input;
  const vfs: Record<string, Float32Array> = {};
  for (const effect of effects) {
    const wetMix = Math.min(1, Math.max(0, effect.params.mix ?? 0.35));
    let wet = node;
    if (effect.type === 'delay') {
      const beats = Math.min(2, Math.max(0.05, effect.params.time ?? 0.25));
      const feedback = Math.min(0.9, Math.max(0, effect.params.feedback ?? 0.3));
      wet = delayNode(node, 120, beats, feedback, 44100);
    } else if (effect.type === 'reverb') {
      wet = reverbNode(node);
      vfs['reverb-ir'] = reverbImpulse();
    } else if (effect.type === 'chorus') {
      wet = chorusNode(node, 44100);
    } else if (effect.type === 'distortion') {
      wet = distortNode(node, Math.min(20, Math.max(1, effect.params.drive ?? 4)));
    } else if (effect.type === 'eq') {
      wet = eqNode(node);
    } else {
      wet = compressorNode(node, effect.params.threshold ?? -18, Math.min(20, Math.max(1, effect.params.ratio ?? 4)));
    }
    node = el.add(el.mul(1 - wetMix, node), el.mul(wetMix, wet)) as Node;
  }
  return { node, vfs };
}

export function lowerPromptGraph(doc: PromptGraph | Record<string, unknown>, holdSeconds = 1): { node: Node; vfs?: Record<string, Float32Array> } {
  const graph = coercePromptGraph(doc);
  const notes = graph.notes.slice(0, Math.max(1, graph.voices));
  const pitch = lfo(graph.lfos, 'pitch');
  const cutoffLfo = lfo(graph.lfos, 'cutoff');
  const ampLfo = lfo(graph.lfos, 'amp');
  const panLfo = lfo(graph.lfos, 'pan');
  const voices = notes.map((note, index) => {
    const gate = gateFor(note, holdSeconds, index);
    const partials = graph.oscillators.slice(0, 3).flatMap((oscillator, oscIndex) => {
      const copies = Math.min(4, Math.max(1, oscillator.unison));
      return Array.from({ length: copies }, (_, copy) => {
        const spread = copies === 1 ? 0 : (copy - (copies - 1) / 2) * (6 + Math.abs(oscillator.detuneCents) / 8);
        const cents = oscillator.detuneCents + spread;
        let frequency: Node | number = midiHz(note.midi + oscillator.octave * 12) * 2 ** (cents / 1200);
        if (graph.glideSeconds > 0) {
          const lift = (frequency as number) * (2 ** ((graph.glideSeconds * 200) / 1200) - 1);
          frequency = el.add(frequency as number, el.mul(lift, el.adsr(0.005, graph.glideSeconds, 0, 0.02, gate)));
        }
        if (pitch) frequency = el.add(frequency as number, el.mul(pitch.depth * 40, el.cycle(pitch.rateHz)));
        return el.mul(oscillator.level / copies, wave(oscillator.wave, frequency, `osc-${index}-${oscIndex}-${copy}`));
      });
    });
    let body = mix(partials);
    const env = el.adsr(graph.filter.adsr.attackSeconds, graph.filter.adsr.decaySeconds, graph.filter.adsr.sustain, graph.filter.adsr.releaseSeconds, gate);
    let cutoff: Node | number = graph.filter.cutoffHz + graph.filter.keytrack * (note.midi - 60) * 80;
    if (graph.filter.envelopeAmount !== 0) cutoff = el.add(cutoff as number, el.mul(graph.filter.envelopeAmount, env));
    if (cutoffLfo) cutoff = el.add(cutoff as number, el.mul(cutoffLfo.depth * 1800, el.cycle(cutoffLfo.rateHz)));
    const q = graph.filter.resonance;
    if (graph.filter.type === 'ladder') {
      for (let pole = 0; pole < 4; pole += 1) body = el.svf({ key: `lad-${index}-${pole}`, mode: 'lowpass' }, cutoff as number, q, body) as Node;
    } else {
      body = el.svf({ key: `flt-${index}`, mode: graph.filter.mode }, cutoff as number, q, body) as Node;
    }
    const amp = el.adsr(graph.amp.attackSeconds, graph.amp.decaySeconds, graph.amp.sustain, graph.amp.releaseSeconds, gate);
    let level: Node | number = amp;
    if (ampLfo) level = el.mul(amp, el.add(1 - ampLfo.depth * 0.5, el.mul(ampLfo.depth * 0.5, el.add(1, el.cycle(ampLfo.rateHz)))));
    body = el.mul(level as number, body) as Node;
    if (panLfo) {
      const offset = el.mul(panLfo.depth, el.add(1, el.cycle(panLfo.rateHz)));
      const shifted = el.delay({ key: `pan-${index}`, size: 32 }, el.add(4, el.mul(6, offset)), 0, body);
      body = el.add(el.mul(0.75, body), el.mul(0.25, shifted)) as Node;
    }
    return body;
  });
  const effected = applyEffects(el.mul(0.35, mix(voices)) as Node, graph.effects);
  return { node: el.dcblock(effected.node) as Node, vfs: effected.vfs };
}

export async function renderPromptGraph(doc: PromptGraph | Record<string, unknown>, trace?: Trace): Promise<{ peak: number; nan: boolean }> {
  const lowered = lowerPromptGraph(doc, 0.35);
  const frames = Math.round(0.45 * 44100);
  const pcm = await renderNode(lowered.node, { sampleRate: 44100, frames, vfs: lowered.vfs, trace });
  let peak = 0;
  let nan = false;
  for (const sample of pcm) {
    if (!Number.isFinite(sample)) nan = true;
    else peak = Math.max(peak, Math.abs(sample));
  }
  return { peak, nan };
}

export function promptHoldNotes(doc: PromptGraph | Record<string, unknown>, holdSeconds: number): NoteEvent[] {
  return coercePromptGraph(doc).notes.slice(0, 8).map((note) => ({
    midi: note.midi,
    startSeconds: note.step * 0.25,
    durationSeconds: holdSeconds,
    velocity: note.velocity,
  }));
}
