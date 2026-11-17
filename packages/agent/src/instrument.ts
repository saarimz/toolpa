import { COOKBOOK, renderPromptGraph, type PromptEffect, type PromptGraph } from '@toolpa/audio';
import { DeviceRegistry, composeRack } from '@toolpa/devices';
import { canonicalize, parseChain, sha256Hex, type Chain } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { AgentError } from './agent.ts';
import { completeRaw, type ProviderSettings } from './providers.ts';

export const OSCILLATORS = ['cycle', 'saw', 'square', 'triangle', 'noise', 'blepsaw'] as const;
export const EFFECTS = ['dry', 'delay', 'reverb', 'compressor', 'limiter', 'eq', 'distort', 'chorus'] as const;
export const FILTERS = ['lowpass', 'highpass', 'bandpass', 'ladder'] as const;

export interface PromptNote {
  midi: number;
  step: number;
  velocity: number;
}

export interface PromptInstrument extends PromptGraph {
  kind: 'prompt-instrument';
  version: 1;
  name: string;
  oscillator: (typeof OSCILLATORS)[number];
  effect: PromptEffect;
  notes: PromptNote[];
}

export interface InstrumentModel {
  readonly provider: 'mock' | 'remote';
  readonly label: string;
  complete(input: { user: string; feedback: string }): Promise<string>;
}

export type InstrumentStage =
  | { stage: 'plan'; attempt: number; detail: string; label?: string; notice?: string }
  | { stage: 'build' | 'repair'; attempt: number; detail: string }
  | { stage: 'wait'; attempt: number; detail: string }
  | { stage: 'validate' | 'render'; attempt: number; ok: boolean; detail: string; peak?: number }
  | {
      stage: 'done';
      provider: 'mock' | 'remote';
      label: string;
      notice: string;
      hash: string;
      rack: string;
      document: PromptInstrument;
      dsl: string;
      chain: Chain;
    }
  | { stage: 'error'; code: string; detail: string };

const EXAMPLE: PromptInstrument = {
  kind: 'prompt-instrument',
  version: 1,
  name: 'warm-saw',
  oscillator: 'blepsaw',
  voice: { attackSeconds: 0.02, decaySeconds: 0.18, sustain: 0.7, releaseSeconds: 0.12 },
  filter: { mode: 'lowpass', cutoffHz: 1400, q: 0.8 },
  lfoHz: 0.2,
  lfoDepthHz: 40,
  effect: 'chorus',
  sampler: false,
  notes: [
    { midi: 60, step: 0, velocity: 100 },
    { midi: 67, step: 2, velocity: 84 },
  ],
};

function finite(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: ${label} is outside ${min}..${max}`);
  }
  return value;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  const number = finite(value, label, min, max);
  if (!Number.isInteger(number)) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: ${label} must be an integer`);
  return number;
}

export function cookbookShot(): string {
  return COOKBOOK.map((patch) => patch.name).join('\n');
}

export function instrumentPrompt(user: string, feedback = ''): string {
  return [
    'Reply with one JSON object and no markdown.',
    'kind is prompt-instrument, version is 1.',
    `oscillator is one of ${OSCILLATORS.join(', ')}.`,
    `effect is one of ${EFFECTS.join(', ')}.`,
    `filter.mode is one of ${FILTERS.join(', ')}.`,
    'Use an envelope, a filter, and an LFO. Set sampler true only for a drum or sample.',
    'notes are 1 to 8 objects of midi, step 0..7, and velocity 1..127.',
    `Cookbook patches to imitate (${COOKBOOK.length}):`,
    cookbookShot(),
    `Example: ${JSON.stringify(EXAMPLE)}`,
    feedback ? `Repair the previous attempt: ${feedback}` : '',
    `Request: ${user}`,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

export function parsePromptInstrument(input: unknown): PromptInstrument {
  const record = typeof input === 'string' ? (extract(input) as Record<string, unknown>) : (input as Record<string, unknown>);
  if (!record || typeof record !== 'object') throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: the document is empty');
  if (record.kind !== 'prompt-instrument' || record.version !== 1) {
    throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: kind must be prompt-instrument version 1');
  }
  const name = typeof record.name === 'string' ? record.name : '';
  if (!/^[a-z0-9-]{1,32}$/.test(name)) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: name must be a short slug');
  if (!OSCILLATORS.includes(record.oscillator as (typeof OSCILLATORS)[number])) {
    throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: unknown oscillator');
  }
  if (!EFFECTS.includes(record.effect as PromptEffect)) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: unknown effect');
  const voice = record.voice as Record<string, unknown> | undefined;
  const filter = record.filter as Record<string, unknown> | undefined;
  if (!voice || !filter) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: voice and filter are required');
  if (!FILTERS.includes(filter.mode as (typeof FILTERS)[number])) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: unknown filter');
  if (!Array.isArray(record.notes) || record.notes.length < 1 || record.notes.length > 8) {
    throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: write 1 to 8 notes');
  }
  const lfoHz = finite(record.lfoHz, 'lfoHz', 0, 20);
  const lfoDepthHz = finite(record.lfoDepthHz, 'lfoDepthHz', 0, 2000);
  if (lfoDepthHz > 0 && lfoHz < 0.05) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: an LFO depth needs a rate');
  const document: PromptInstrument = {
    kind: 'prompt-instrument',
    version: 1,
    name,
    oscillator: record.oscillator as PromptInstrument['oscillator'],
    voice: {
      attackSeconds: finite(voice.attackSeconds, 'attackSeconds', 0, 2),
      decaySeconds: finite(voice.decaySeconds, 'decaySeconds', 0, 4),
      sustain: finite(voice.sustain, 'sustain', 0, 1),
      releaseSeconds: finite(voice.releaseSeconds, 'releaseSeconds', 0, 4),
    },
    filter: {
      mode: filter.mode as PromptInstrument['filter']['mode'],
      cutoffHz: finite(filter.cutoffHz, 'cutoffHz', 20, 20000),
      q: finite(filter.q, 'q', 0.1, 18),
    },
    lfoHz,
    lfoDepthHz,
    effect: record.effect as PromptEffect,
    sampler: record.sampler === true,
    notes: record.notes.map((note, index) => {
      const item = note as Record<string, unknown>;
      return {
        midi: integer(item.midi, `notes[${index}].midi`, 0, 127),
        step: integer(item.step, `notes[${index}].step`, 0, 7),
        velocity: integer(item.velocity, `notes[${index}].velocity`, 1, 127),
      };
    }),
  };
  return document;
}

function extract(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  if (raw.trim().startsWith('prompt-instrument')) return dslToDocument(raw);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: the model did not return JSON');
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: the model returned invalid JSON');
  }
}

export function instrumentDsl(doc: PromptInstrument): string {
  const notes = doc.notes.map((note) => `note ${note.midi} ${note.step} ${note.velocity}`).join('\n');
  return [
    `prompt-instrument ${doc.name}`,
    `osc ${doc.oscillator}`,
    `adsr ${doc.voice.attackSeconds} ${doc.voice.decaySeconds} ${doc.voice.sustain} ${doc.voice.releaseSeconds}`,
    `filter ${doc.filter.mode} ${doc.filter.cutoffHz} ${doc.filter.q}`,
    `lfo ${doc.lfoHz} ${doc.lfoDepthHz}`,
    `effect ${doc.effect}`,
    `sampler ${doc.sampler ? 'yes' : 'no'}`,
    notes,
  ].join('\n');
}

function dslToDocument(text: string): unknown {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const header = lines[0]?.split(/\s+/) ?? [];
  if (header[0] !== 'prompt-instrument') throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: the DSL must start with prompt-instrument');
  const read = (label: string) => lines.find((line) => line.startsWith(`${label} `))?.split(/\s+/).slice(1) ?? [];
  const osc = read('osc');
  const adsr = read('adsr');
  const filter = read('filter');
  const lfo = read('lfo');
  const effect = read('effect');
  const sampler = read('sampler');
  return {
    kind: 'prompt-instrument',
    version: 1,
    name: header[1] ?? 'voice',
    oscillator: osc[0],
    voice: {
      attackSeconds: Number(adsr[0]),
      decaySeconds: Number(adsr[1]),
      sustain: Number(adsr[2]),
      releaseSeconds: Number(adsr[3]),
    },
    filter: { mode: filter[0], cutoffHz: Number(filter[1]), q: Number(filter[2]) },
    lfoHz: Number(lfo[0]),
    lfoDepthHz: Number(lfo[1]),
    effect: effect[0],
    sampler: sampler[0] === 'yes',
    notes: lines
      .filter((line) => line.startsWith('note '))
      .map((line) => {
        const [, midi, step, velocity] = line.split(/\s+/);
        return { midi: Number(midi), step: Number(step), velocity: Number(velocity) };
      }),
  };
}

export function chainFromPrompt(doc: PromptInstrument): Chain {
  const midi = doc.notes[0]?.midi ?? 60;
  const frequencyHz = Math.round(440 * 2 ** ((midi - 69) / 12));
  return parseChain({
    kind: 'chain',
    version: 1,
    sampleRate: 44100,
    source: doc.oscillator === 'noise' ? { type: 'noise', seed: 11 } : { type: 'sine', frequencyHz },
    effect: {
      type: 'tone',
      cutoffHz: Math.round(doc.filter.cutoffHz),
      q: doc.filter.q,
      gain: Math.min(1, Math.max(0.05, doc.voice.sustain * 0.5)),
    },
  });
}

export async function validateInstrumentRack(doc: PromptInstrument, trace?: Trace): Promise<string> {
  const registry = new DeviceRegistry();
  registry.register({ id: 'keys', role: 'midi', title: 'Keys' }, trace);
  if (doc.sampler) registry.register({ id: 'sampler', role: 'instrument', title: 'Sampler' }, trace);
  else registry.register({ id: 'voice', role: 'instrument', title: 'Voice' }, trace);
  registry.register(
    {
      id: 'tone',
      role: 'effect',
      title: 'Tone',
      effect: { type: 'tone', cutoffHz: doc.filter.cutoffHz, q: doc.filter.q, gain: Math.min(1, Math.max(0.05, doc.voice.sustain)) },
    },
    trace,
  );
  const ids = doc.sampler ? ['keys', 'sampler', 'tone'] : ['keys', 'voice', 'tone'];
  const rack = await composeRack(registry, ids, trace);
  return rack.hash;
}

export function mockInstrument(prompt: string): PromptInstrument {
  const text = prompt.toLowerCase();
  const oscillator = text.includes('square')
    ? 'square'
    : text.includes('triangle')
      ? 'triangle'
      : text.includes('noise')
        ? 'noise'
        : text.includes('saw')
          ? 'blepsaw'
          : 'cycle';
  const effect: PromptEffect = text.includes('reverb')
    ? 'reverb'
    : text.includes('delay')
      ? 'delay'
      : text.includes('distort') || text.includes('drive')
        ? 'distort'
        : text.includes('chorus')
          ? 'chorus'
          : text.includes('compress')
            ? 'compressor'
            : text.includes('limit')
              ? 'limiter'
              : text.includes('eq')
                ? 'eq'
                : 'dry';
  const pad = text.includes('pad') || text.includes('warm');
  const bass = text.includes('bass');
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'voice';
  return parsePromptInstrument({
    kind: 'prompt-instrument',
    version: 1,
    name: slug,
    oscillator,
    voice: {
      attackSeconds: pad ? 0.18 : 0.01,
      decaySeconds: pad ? 0.28 : 0.12,
      sustain: pad ? 0.75 : 0.62,
      releaseSeconds: pad ? 0.35 : 0.08,
    },
    filter: {
      mode: text.includes('ladder') ? 'ladder' : text.includes('highpass') ? 'highpass' : 'lowpass',
      cutoffHz: text.includes('dark') || bass ? 480 : text.includes('bright') ? 5200 : 1600,
      q: 0.8,
    },
    lfoHz: text.includes('lfo') || text.includes('wobble') ? 4 : 0,
    lfoDepthHz: text.includes('lfo') || text.includes('wobble') ? 60 : 0,
    effect,
    sampler: text.includes('sample') || text.includes('drum'),
    notes: bass
      ? [
          { midi: 36, step: 0, velocity: 108 },
          { midi: 43, step: 2, velocity: 90 },
        ]
      : [
          { midi: 60, step: 0, velocity: 104 },
          { midi: 67, step: 2, velocity: 86 },
        ],
  });
}

export function repairInstrument(doc: PromptInstrument, reason: 'silence' | 'clip' | 'nan' | 'validate'): PromptInstrument {
  const next: PromptInstrument = structuredClone(doc);
  if (reason === 'silence' || reason === 'validate') {
    next.oscillator = next.oscillator === 'noise' ? 'cycle' : next.oscillator;
    next.voice.sustain = Math.max(next.voice.sustain, 0.8);
    next.voice.attackSeconds = Math.min(next.voice.attackSeconds, 0.05);
    next.filter.mode = 'lowpass';
    next.filter.cutoffHz = Math.max(next.filter.cutoffHz, 1800);
    next.filter.q = Math.min(Math.max(next.filter.q, 0.7), 1.2);
    next.lfoDepthHz = 0;
    next.effect = 'dry';
    next.notes = next.notes.map((note) => ({ ...note, velocity: Math.max(note.velocity, 110) }));
  }
  if (reason === 'clip') {
    next.voice.sustain = Math.max(0.25, next.voice.sustain * 0.5);
    next.lfoDepthHz = 0;
    next.effect = next.effect === 'distort' ? 'limiter' : next.effect;
    next.notes = next.notes.map((note) => ({ ...note, velocity: Math.min(note.velocity, 72) }));
  }
  if (reason === 'nan') {
    next.filter = { mode: 'lowpass', cutoffHz: 1200, q: 0.7 };
    next.lfoHz = 0;
    next.lfoDepthHz = 0;
    next.effect = 'dry';
  }
  return parsePromptInstrument(next);
}

function judge(audio: { peak: number; nan: boolean }): 'silence' | 'clip' | 'nan' | null {
  if (audio.nan || !Number.isFinite(audio.peak)) return 'nan';
  if (audio.peak < 0.02) return 'silence';
  if (audio.peak > 0.98) return 'clip';
  return null;
}

export class MockInstrumentModel implements InstrumentModel {
  readonly provider = 'mock' as const;
  readonly label = 'mock';
  complete(input: { user: string }): Promise<string> {
    return Promise.resolve(JSON.stringify(mockInstrument(input.user)));
  }
}

export function remoteInstrumentModel(settings: ProviderSettings, trace?: Trace): InstrumentModel {
  return {
    provider: 'remote',
    label: settings.kind,
    complete(input: { user: string; feedback: string }) {
      return completeRaw(settings, instrumentPrompt(input.user, input.feedback), trace);
    },
  };
}

export async function runInstrumentAgent(
  prompt: string,
  options: {
    maxAttempts: number;
    model?: InstrumentModel;
    render?: (doc: PromptInstrument) => Promise<{ peak: number; nan: boolean }>;
    onStage?: (stage: InstrumentStage) => void;
  },
  trace?: Trace,
): Promise<{ document: PromptInstrument; hash: string; rack: string; dsl: string; attempts: number; provider: 'mock' | 'remote' }> {
  const text = prompt.trim();
  if (!text) throw new AgentError('AGENT_EMPTY', 'AGENT_EMPTY: the prompt is empty');
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 4) {
    throw new AgentError('AGENT_BUDGET', 'AGENT_BUDGET: maxAttempts must be an integer from 1 to 4');
  }
  const model = options.model ?? new MockInstrumentModel();
  const render = options.render ?? ((doc: PromptInstrument) => renderPromptGraph(doc, trace));
  let candidate: PromptInstrument | null = null;
  let feedback = '';
  let lastReason = 'AGENT_VALIDATE';
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    options.onStage?.({ stage: 'plan', attempt, detail: feedback || 'Reading the prompt against the cookbook' });
    trace?.event('agent.stage', { stage: 'plan', attempt, ok: true });
    let doc: PromptInstrument;
    try {
      if (candidate) {
        doc = candidate;
        candidate = null;
        options.onStage?.({ stage: 'build', attempt, detail: 'Using the repaired document' });
      } else {
        const raw = await model.complete({ user: text, feedback });
        doc = parsePromptInstrument(raw);
        options.onStage?.({ stage: 'build', attempt, detail: `${doc.oscillator} ${doc.effect}` });
      }
      const rack = await validateInstrumentRack(doc, trace);
      options.onStage?.({ stage: 'validate', attempt, ok: true, detail: rack });
      trace?.event('agent.stage', { stage: 'validate', attempt, ok: true });
      const audio = await render(doc);
      const reason = judge(audio);
      options.onStage?.({ stage: 'render', attempt, ok: reason === null, detail: reason ?? 'audible', peak: audio.peak });
      trace?.event('agent.stage', { stage: 'render', attempt, ok: reason === null });
      if (reason) {
        lastReason = reason;
        feedback = reason;
        candidate = repairInstrument(doc, reason);
        options.onStage?.({ stage: 'repair', attempt, detail: reason });
        trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: false });
        continue;
      }
      const hash = await sha256Hex(canonicalize(doc));
      trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: true });
      trace?.event('agent.audition', { hash, attempt });
      return { document: doc, hash, rack, dsl: instrumentDsl(doc), attempts: attempt, provider: model.provider };
    } catch (error) {
      if (error instanceof AgentError && (error.code === 'MODEL_HTTP' || error.code === 'NOT_CONFIGURED' || error.code === 'MODEL_SECRET' || error.code === 'MODEL_URL')) {
        throw error;
      }
      lastReason = error instanceof AgentError ? error.code : 'error';
      feedback = lastReason;
      candidate = repairInstrument(mockInstrument(text), 'validate');
      options.onStage?.({ stage: 'repair', attempt, detail: lastReason });
      trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: false });
      trace?.event('agent.stage', { stage: 'repair', attempt, ok: false });
    }
  }
  trace?.event('agent.audition', { hash: '', attempt: options.maxAttempts, ok: false });
  throw new AgentError('AGENT_BUDGET', `AGENT_BUDGET: stopped after ${options.maxAttempts} attempts (${lastReason})`);
}
