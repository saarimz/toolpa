import { COOKBOOK, renderPromptGraph, type PromptAdsr, type PromptEffectSpec, type PromptGraph, type PromptLfo, type PromptOscillator, type PromptWave } from '@toolpa/audio';
import { DeviceRegistry, composeRack } from '@toolpa/devices';
import { canonicalize, parseChain, sha256Hex, type Chain } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { AgentError } from './agent.ts';
import { completeRaw, type ProviderSettings } from './providers.ts';

export const OSCILLATORS = ['saw', 'square', 'triangle', 'sine', 'noise'] as const;
export const EFFECTS = ['delay', 'reverb', 'chorus', 'distortion', 'eq', 'compressor'] as const;
export const FILTERS = ['lowpass', 'highpass', 'bandpass'] as const;
export const LFO_TARGETS = ['cutoff', 'pitch', 'amp', 'pan'] as const;

export interface PromptNote {
  midi: number;
  step: number;
  velocity: number;
}

export interface InstrumentMacro {
  name: string;
  target: string;
  min: number;
  max: number;
  value: number;
}

export interface PromptInstrument extends PromptGraph {
  kind: 'prompt-instrument';
  version: 2;
  name: string;
  description: string;
  oscillators: PromptOscillator[];
  lfos: PromptLfo[];
  effects: PromptEffectSpec[];
  notes: PromptNote[];
  macros: InstrumentMacro[];
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
      attempt: number;
      adjusted: boolean;
      description: string;
    }
  | { stage: 'error'; code: string; detail: string };

export const INSTRUMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'version', 'name', 'description', 'voices', 'glideSeconds', 'oscillators', 'amp', 'filter', 'lfos', 'effects', 'macros', 'notes'],
  properties: {
    kind: { const: 'prompt-instrument' },
    version: { const: 2 },
    name: { type: 'string' },
    description: { type: 'string' },
    voices: { type: 'integer', minimum: 1, maximum: 8 },
    glideSeconds: { type: 'number', minimum: 0, maximum: 2 },
    oscillators: { type: 'array', minItems: 1, maxItems: 3 },
    amp: { type: 'object' },
    filter: { type: 'object' },
    lfos: { type: 'array', maxItems: 3 },
    effects: { type: 'array', maxItems: 4 },
    macros: { type: 'array', maxItems: 6 },
    notes: { type: 'array', minItems: 1, maxItems: 8 },
  },
};

const ADSR = (attack: number, decay: number, sustain: number, release: number): PromptAdsr => ({
  attackSeconds: attack,
  decaySeconds: decay,
  sustain,
  releaseSeconds: release,
});

function finite(value: unknown, label: string, min: number, max: number): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
    throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: ${label} is outside ${min}..${max}`);
  }
  return number;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  const number = finite(value, label, min, max);
  if (!Number.isInteger(number)) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: ${label} must be an integer`);
  return number;
}

function adsr(value: unknown, label: string): PromptAdsr {
  const record = value as Record<string, unknown> | undefined;
  if (!record) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: ${label} is required`);
  return {
    attackSeconds: finite(record.attackSeconds, `${label}.attackSeconds`, 0, 2),
    decaySeconds: finite(record.decaySeconds, `${label}.decaySeconds`, 0, 4),
    sustain: finite(record.sustain, `${label}.sustain`, 0, 1),
    releaseSeconds: finite(record.releaseSeconds, `${label}.releaseSeconds`, 0, 4),
  };
}

function slug(value: string, fallback: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return cleaned || fallback;
}

export function cookbookShot(): string {
  return COOKBOOK.map((patch) => patch.name).join('\n');
}

export function fewShotExamples(): PromptInstrument[] {
  return [
    base('warm-pad', 'Detuned saw pad with a slow filter sweep and a little reverb.', { pad: true, detune: true, sweep: true, reverb: true }),
    base('pluck', 'Short saw pluck.', { pluck: true }),
    base('bass', 'Punchy sine and saw bass with a short envelope.', { bass: true, short: true }),
    base('lead', 'Bright saw lead with glide and delay.', { lead: true, delay: true, glide: true }),
    base('bell', 'Sine and triangle bell.', { bell: true }),
    base('drone', 'Slow triangle drone with pitch movement.', { drone: true }),
    base('keys', 'Soft electric piano.', { keys: true }),
    base('strings', 'Slow string ensemble with chorus.', { pad: true, chorus: true }),
  ];
}

export function instrumentMessages(user: string, feedback = ''): { system: string; user: string } {
  const system = [
    'Return one JSON object for a playable Toolpa instrument. No markdown.',
    'kind is prompt-instrument and version is 2.',
    'Use 1 to 3 oscillators (saw, square, triangle, sine, noise) with detuneCents, octave, level, and unison.',
    'Include polyphony in voices, amp ADSR, a svf or ladder filter with cutoff, resonance, envelopeAmount, keytrack, and filter ADSR.',
    'LFOs route to cutoff, pitch, amp, or pan. Effects are an ordered chain of delay, reverb, chorus, distortion, eq, and compressor with params.',
    'macros name a parameter such as filter.cutoffHz.',
    `Schema: ${JSON.stringify(INSTRUMENT_JSON_SCHEMA)}`,
    'Examples:',
    ...fewShotExamples().map((example) => JSON.stringify(example)),
    `Cookbook color names:\n${cookbookShot()}`,
  ].join('\n');
  const lines = [feedback ? `The previous response failed: ${feedback}. Return corrected JSON for the same request.` : '', `Request: ${user}`];
  return { system, user: lines.filter((line) => line.length > 0).join('\n') };
}

export function instrumentPrompt(user: string, feedback = ''): string {
  const messages = instrumentMessages(user, feedback);
  return `${messages.system}\n${messages.user}`;
}

export function parsePromptInstrument(input: unknown): PromptInstrument {
  const record = typeof input === 'string' ? (extract(input) as Record<string, unknown>) : (input as Record<string, unknown>);
  if (!record || typeof record !== 'object') throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: the document is empty');
  if (record.kind !== 'prompt-instrument' || record.version !== 2) {
    throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: kind must be prompt-instrument version 2');
  }
  const name = slug(typeof record.name === 'string' ? record.name : '', '');
  if (!name) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: name must be a short slug');
  const description = typeof record.description === 'string' ? record.description.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  if (description.length < 3) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: description is required');
  if (!Array.isArray(record.oscillators) || record.oscillators.length < 1 || record.oscillators.length > 3) {
    throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: write 1 to 3 oscillators');
  }
  const oscillators = record.oscillators.map((item, index) => {
    const osc = item as Record<string, unknown>;
    if (!OSCILLATORS.includes(osc.wave as PromptWave)) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: oscillators[${index}].wave is unknown`);
    return {
      wave: osc.wave as PromptWave,
      detuneCents: finite(osc.detuneCents, `oscillators[${index}].detuneCents`, -100, 100),
      octave: integer(osc.octave, `oscillators[${index}].octave`, -2, 2),
      level: finite(osc.level, `oscillators[${index}].level`, 0, 1),
      unison: integer(osc.unison, `oscillators[${index}].unison`, 1, 4),
    };
  });
  const filter = record.filter as Record<string, unknown> | undefined;
  if (!filter) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: filter is required');
  if (filter.type !== 'svf' && filter.type !== 'ladder') throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: filter.type must be svf or ladder');
  if (!FILTERS.includes(filter.mode as (typeof FILTERS)[number])) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: unknown filter mode');
  const lfos = Array.isArray(record.lfos) ? record.lfos : [];
  if (lfos.length > 3) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: at most 3 LFOs');
  const parsedLfos = lfos.map((item, index) => {
    const lfo = item as Record<string, unknown>;
    if (!LFO_TARGETS.includes(lfo.target as (typeof LFO_TARGETS)[number])) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: lfos[${index}].target is unknown`);
    const rateHz = finite(lfo.rateHz, `lfos[${index}].rateHz`, 0, 20);
    const depth = finite(lfo.depth, `lfos[${index}].depth`, 0, 1);
    if (depth > 0 && rateHz < 0.05) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: an LFO depth needs a rate');
    return { rateHz, depth, target: lfo.target as PromptLfo['target'] };
  });
  const effectsIn = Array.isArray(record.effects) ? record.effects : [];
  if (effectsIn.length > 4) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: at most 4 effects');
  const effects = effectsIn.map((item, index) => {
    const effect = item as Record<string, unknown>;
    if (!EFFECTS.includes(effect.type as (typeof EFFECTS)[number])) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: effects[${index}].type is unknown`);
    const params = (effect.params ?? {}) as Record<string, unknown>;
    return {
      type: effect.type as PromptEffectSpec['type'],
      params: {
        ...(params.mix === undefined ? {} : { mix: finite(params.mix, `effects[${index}].mix`, 0, 1) }),
        ...(params.feedback === undefined ? {} : { feedback: finite(params.feedback, `effects[${index}].feedback`, 0, 0.9) }),
        ...(params.time === undefined ? {} : { time: finite(params.time, `effects[${index}].time`, 0.05, 2) }),
        ...(params.drive === undefined ? {} : { drive: finite(params.drive, `effects[${index}].drive`, 1, 20) }),
        ...(params.threshold === undefined ? {} : { threshold: finite(params.threshold, `effects[${index}].threshold`, -40, 0) }),
        ...(params.ratio === undefined ? {} : { ratio: finite(params.ratio, `effects[${index}].ratio`, 1, 20) }),
      },
    };
  });
  if (!Array.isArray(record.notes) || record.notes.length < 1 || record.notes.length > 8) {
    throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: write 1 to 8 notes');
  }
  const notes = record.notes.map((note, index) => {
    const item = note as Record<string, unknown>;
    return {
      midi: integer(item.midi, `notes[${index}].midi`, 0, 127),
      step: integer(item.step, `notes[${index}].step`, 0, 7),
      velocity: integer(item.velocity, `notes[${index}].velocity`, 1, 127),
    };
  });
  const voices = integer(record.voices, 'voices', 1, 8);
  if (notes.length > voices) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: notes must fit in voices');
  const macrosIn = Array.isArray(record.macros) ? record.macros : [];
  if (macrosIn.length > 6) throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: at most 6 macros');
  const macros = macrosIn.map((item, index) => {
    const macro = item as Record<string, unknown>;
    const macroName = slug(typeof macro.name === 'string' ? macro.name : '', '');
    if (!macroName) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: macros[${index}].name is empty`);
    if (typeof macro.target !== 'string' || !/^[a-z][A-Za-z0-9.]{0,48}$/.test(macro.target)) {
      throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: macros[${index}].target is not a parameter path`);
    }
    const min = finite(macro.min, `macros[${index}].min`, -10000, 10000);
    const max = finite(macro.max, `macros[${index}].max`, -10000, 20000);
    if (max < min) throw new AgentError('AGENT_VALIDATE', `AGENT_VALIDATE: macros[${index}] max is below min`);
    return { name: macroName, target: macro.target, min, max, value: finite(macro.value, `macros[${index}].value`, min, max) };
  });
  return {
    kind: 'prompt-instrument',
    version: 2,
    name,
    description,
    voices,
    glideSeconds: finite(record.glideSeconds, 'glideSeconds', 0, 2),
    oscillators,
    amp: adsr(record.amp, 'amp'),
    filter: {
      type: filter.type,
      mode: filter.mode as PromptInstrument['filter']['mode'],
      cutoffHz: finite(filter.cutoffHz, 'cutoffHz', 20, 20000),
      resonance: finite(filter.resonance, 'resonance', 0.1, 8),
      envelopeAmount: finite(filter.envelopeAmount, 'envelopeAmount', -4000, 4000),
      keytrack: finite(filter.keytrack, 'keytrack', 0, 1),
      adsr: adsr(filter.adsr, 'filter.adsr'),
    },
    lfos: parsedLfos,
    effects,
    macros,
    notes,
  };
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
  const lines = [
    `prompt-instrument ${doc.name}`,
    `description ${doc.description}`,
    `voices ${doc.voices}`,
    `glide ${doc.glideSeconds}`,
    ...doc.oscillators.map((osc) => `osc ${osc.wave} ${osc.detuneCents} ${osc.octave} ${osc.level} ${osc.unison}`),
    `amp ${doc.amp.attackSeconds} ${doc.amp.decaySeconds} ${doc.amp.sustain} ${doc.amp.releaseSeconds}`,
    `filter ${doc.filter.type} ${doc.filter.mode} ${doc.filter.cutoffHz} ${doc.filter.resonance} ${doc.filter.envelopeAmount} ${doc.filter.keytrack} ${doc.filter.adsr.attackSeconds} ${doc.filter.adsr.decaySeconds} ${doc.filter.adsr.sustain} ${doc.filter.adsr.releaseSeconds}`,
    ...doc.lfos.map((lfo) => `lfo ${lfo.rateHz} ${lfo.depth} ${lfo.target}`),
    ...doc.effects.map((effect) => `effect ${effect.type} ${effect.params.mix ?? 0.35} ${effect.params.feedback ?? 0} ${effect.params.time ?? 0.25} ${effect.params.drive ?? 1}`),
    ...doc.macros.map((macro) => `macro ${macro.name} ${macro.target} ${macro.min} ${macro.max} ${macro.value}`),
    ...doc.notes.map((note) => `note ${note.midi} ${note.step} ${note.velocity}`),
  ];
  return lines.join('\n');
}

function dslToDocument(text: string): unknown {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const header = lines[0]?.split(/\s+/) ?? [];
  if (header[0] !== 'prompt-instrument') throw new AgentError('AGENT_VALIDATE', 'AGENT_VALIDATE: the DSL must start with prompt-instrument');
  const description = lines.find((line) => line.startsWith('description '))?.slice('description '.length) ?? '';
  const read = (label: string) => lines.find((line) => line.startsWith(`${label} `))?.split(/\s+/).slice(1) ?? [];
  const voices = read('voices');
  const glide = read('glide');
  const amp = read('amp');
  const filter = read('filter');
  return {
    kind: 'prompt-instrument',
    version: 2,
    name: header[1] ?? 'voice',
    description,
    voices: Number(voices[0] ?? 1),
    glideSeconds: Number(glide[0] ?? 0),
    oscillators: lines.filter((line) => line.startsWith('osc ')).map((line) => {
      const [, wave, detune, octave, level, unison] = line.split(/\s+/);
      return { wave, detuneCents: Number(detune), octave: Number(octave), level: Number(level), unison: Number(unison) };
    }),
    amp: { attackSeconds: Number(amp[0]), decaySeconds: Number(amp[1]), sustain: Number(amp[2]), releaseSeconds: Number(amp[3]) },
    filter: {
      type: filter[0],
      mode: filter[1],
      cutoffHz: Number(filter[2]),
      resonance: Number(filter[3]),
      envelopeAmount: Number(filter[4]),
      keytrack: Number(filter[5]),
      adsr: { attackSeconds: Number(filter[6]), decaySeconds: Number(filter[7]), sustain: Number(filter[8]), releaseSeconds: Number(filter[9]) },
    },
    lfos: lines.filter((line) => line.startsWith('lfo ')).map((line) => {
      const [, rate, depth, target] = line.split(/\s+/);
      return { rateHz: Number(rate), depth: Number(depth), target };
    }),
    effects: lines.filter((line) => line.startsWith('effect ')).map((line) => {
      const [, type, mix, feedback, time, drive] = line.split(/\s+/);
      return { type, params: { mix: Number(mix), feedback: Number(feedback), time: Number(time), drive: Number(drive) } };
    }),
    macros: lines.filter((line) => line.startsWith('macro ')).map((line) => {
      const [, name, target, min, max, value] = line.split(/\s+/);
      return { name, target, min: Number(min), max: Number(max), value: Number(value) };
    }),
    notes: lines.filter((line) => line.startsWith('note ')).map((line) => {
      const [, midi, step, velocity] = line.split(/\s+/);
      return { midi: Number(midi), step: Number(step), velocity: Number(velocity) };
    }),
  };
}

export function chainFromPrompt(doc: PromptInstrument): Chain {
  const midi = doc.notes[0]?.midi ?? 60;
  const frequencyHz = Math.round(440 * 2 ** ((midi - 69) / 12));
  const wave = doc.oscillators[0]?.wave;
  return parseChain({
    kind: 'chain',
    version: 1,
    sampleRate: 44100,
    source: wave === 'noise' ? { type: 'noise', seed: 11 } : { type: 'sine', frequencyHz },
    effect: {
      type: 'tone',
      cutoffHz: Math.round(doc.filter.cutoffHz),
      q: Math.min(8, Math.max(0.1, doc.filter.resonance)),
      gain: Math.min(1, Math.max(0.05, doc.amp.sustain * 0.5)),
    },
  });
}

export async function validateInstrumentRack(doc: PromptInstrument, trace?: Trace): Promise<string> {
  const registry = new DeviceRegistry();
  registry.register({ id: 'keys', role: 'midi', title: 'Keys' }, trace);
  registry.register({ id: 'voice', role: 'instrument', title: doc.name }, trace);
  registry.register(
    {
      id: 'tone',
      role: 'effect',
      title: 'Tone',
      effect: { type: 'tone', cutoffHz: doc.filter.cutoffHz, q: Math.min(8, doc.filter.resonance), gain: Math.min(1, Math.max(0.05, doc.oscillators[0]?.level ?? 0.3)) },
    },
    trace,
  );
  const rack = await composeRack(registry, ['keys', 'voice', 'tone'], trace);
  return rack.hash;
}

function setPath(doc: PromptInstrument, target: string, value: number): void {
  if (target === 'filter.cutoffHz') doc.filter.cutoffHz = value;
  else if (target === 'filter.resonance') doc.filter.resonance = value;
  else if (target === 'amp.sustain') doc.amp.sustain = value;
  else if (target === 'glideSeconds') doc.glideSeconds = value;
  else if (target === 'oscillators.0.level' && doc.oscillators[0]) doc.oscillators[0].level = value;
  else if (target === 'oscillators.0.detuneCents' && doc.oscillators[0]) doc.oscillators[0].detuneCents = value;
  else if (target === 'lfos.0.depth' && doc.lfos[0]) doc.lfos[0].depth = value;
  else if (target === 'effects.0.params.mix' && doc.effects[0]) doc.effects[0].params.mix = value;
  else if (target === 'effects.0.params.drive' && doc.effects[0]) doc.effects[0].params.drive = value;
}

export function applyMacro(doc: PromptInstrument, name: string, value: number): PromptInstrument {
  const next: PromptInstrument = structuredClone(doc);
  const macro = next.macros.find((item) => item.name === name);
  if (!macro) return doc;
  const clamped = Math.min(macro.max, Math.max(macro.min, value));
  macro.value = clamped;
  setPath(next, macro.target, clamped);
  return parsePromptInstrument(next);
}

interface Flags {
  pad?: boolean;
  detune?: boolean;
  sweep?: boolean;
  reverb?: boolean;
  delay?: boolean;
  chorus?: boolean;
  bass?: boolean;
  short?: boolean;
  pluck?: boolean;
  lead?: boolean;
  bell?: boolean;
  drone?: boolean;
  keys?: boolean;
  glide?: boolean;
  distort?: boolean;
}

function base(name: string, description: string, flags: Flags): PromptInstrument {
  const bass = flags.bass === true;
  const short = flags.short === true || flags.pluck === true;
  const pad = flags.pad === true || flags.drone === true;
  const oscillators: PromptOscillator[] = flags.bell
    ? [
        { wave: 'sine', detuneCents: 0, octave: 0, level: 0.28, unison: 1 },
        { wave: 'triangle', detuneCents: 4, octave: 1, level: 0.12, unison: 1 },
      ]
    : flags.bass
      ? [
          { wave: 'sine', detuneCents: 0, octave: -1, level: 0.34, unison: 1 },
          { wave: 'saw', detuneCents: 6, octave: 0, level: 0.16, unison: 1 },
        ]
      : [
          { wave: flags.drone ? 'triangle' : flags.keys ? 'sine' : 'saw', detuneCents: flags.detune ? -8 : 0, octave: 0, level: 0.28, unison: flags.detune ? 2 : 1 },
          ...(flags.detune ? [{ wave: 'saw' as const, detuneCents: 8, octave: 0, level: 0.18, unison: 1 }] : []),
        ];
  const effects: PromptEffectSpec[] = [];
  if (flags.reverb) effects.push({ type: 'reverb', params: { mix: 0.28 } });
  if (flags.delay) effects.push({ type: 'delay', params: { mix: 0.25, feedback: 0.28, time: 0.25 } });
  if (flags.chorus) effects.push({ type: 'chorus', params: { mix: 0.3 } });
  if (flags.distort) effects.push({ type: 'distortion', params: { mix: 0.4, drive: 4 } });
  const lfos: PromptLfo[] = [];
  if (flags.sweep) lfos.push({ rateHz: 0.15, depth: 0.45, target: 'cutoff' });
  if (flags.drone) lfos.push({ rateHz: 0.2, depth: 0.25, target: 'pitch' });
  const cutoff = bass ? 420 : flags.bell ? 4200 : flags.lead ? 2800 : pad ? 900 : 1600;
  return parsePromptInstrument({
    kind: 'prompt-instrument',
    version: 2,
    name,
    description,
    voices: bass ? 2 : 4,
    glideSeconds: flags.glide ? 0.08 : 0,
    oscillators,
    amp: short ? ADSR(0.005, 0.12, 0.15, 0.08) : pad ? ADSR(0.22, 0.3, 0.72, 0.4) : ADSR(0.01, 0.16, 0.62, 0.12),
    filter: {
      type: 'svf',
      mode: 'lowpass',
      cutoffHz: cutoff,
      resonance: bass ? 0.9 : 0.7,
      envelopeAmount: short ? 900 : flags.sweep ? 1400 : 200,
      keytrack: flags.keys ? 0.35 : 0.15,
      adsr: short ? ADSR(0.005, 0.1, 0.1, 0.08) : ADSR(0.05, 0.2, 0.4, 0.2),
    },
    lfos,
    effects,
    macros: [{ name: 'cutoff', target: 'filter.cutoffHz', min: 80, max: 8000, value: cutoff }],
    notes: bass
      ? [{ midi: 36, step: 0, velocity: 110 }, { midi: 43, step: 2, velocity: 96 }]
      : [{ midi: 60, step: 0, velocity: 100 }, { midi: flags.bell ? 72 : 67, step: 2, velocity: 84 }],
  });
}

export function mockInstrument(prompt: string): PromptInstrument {
  const text = prompt.toLowerCase();
  const name = slug(prompt, 'voice');
  return base(name, text.slice(0, 160) || 'A generated instrument.', {
    pad: text.includes('pad') || text.includes('warm') || text.includes('string') || text.includes('choir'),
    detune: text.includes('detune') || text.includes('warm') || text.includes('unison'),
    sweep: text.includes('sweep') || text.includes('filter') || text.includes('wobble') || text.includes('lfo'),
    reverb: text.includes('reverb') || text.includes('space') || text.includes('airy'),
    delay: text.includes('delay') || text.includes('echo'),
    chorus: text.includes('chorus') || text.includes('string'),
    bass: text.includes('bass') || text.includes('808') || text.includes('sub'),
    short: text.includes('short') || text.includes('pluck') || text.includes('punch') || text.includes('kick'),
    pluck: text.includes('pluck'),
    lead: text.includes('lead'),
    bell: text.includes('bell') || text.includes('mallet'),
    drone: text.includes('drone'),
    keys: text.includes('key') || text.includes('piano'),
    glide: text.includes('glide') || text.includes('portamento'),
    distort: text.includes('distort') || text.includes('drive') || text.includes('scream'),
  });
}

export function repairInstrument(doc: PromptInstrument, reason: 'silence' | 'clip' | 'nan'): PromptInstrument {
  const next: PromptInstrument = structuredClone(doc);
  if (reason === 'silence') {
    next.amp.sustain = Math.max(next.amp.sustain, 0.8);
    next.amp.attackSeconds = Math.min(next.amp.attackSeconds, 0.05);
    next.oscillators = next.oscillators.map((osc) => ({ ...osc, level: Math.max(osc.level, 0.3), wave: osc.wave === 'noise' ? 'sine' : osc.wave }));
    next.filter.cutoffHz = Math.max(next.filter.cutoffHz, 1800);
    next.filter.resonance = Math.min(Math.max(next.filter.resonance, 0.6), 1.2);
    next.lfos = next.lfos.map((lfo) => (lfo.target === 'amp' ? { ...lfo, depth: 0 } : lfo));
    next.effects = next.effects.map((effect) => ({ ...effect, params: { ...effect.params, mix: 0 } }));
    next.notes = next.notes.map((note) => ({ ...note, velocity: Math.max(note.velocity, 110) }));
  }
  if (reason === 'clip') {
    next.amp.sustain = Math.max(0.2, next.amp.sustain * 0.5);
    next.oscillators = next.oscillators.map((osc) => ({ ...osc, level: Math.max(0.12, osc.level * 0.5) }));
    next.effects = next.effects.map((effect) => (effect.type === 'distortion' ? { ...effect, params: { ...effect.params, drive: 1, mix: Math.min(effect.params.mix ?? 0.3, 0.2) } } : effect));
    next.notes = next.notes.map((note) => ({ ...note, velocity: Math.min(note.velocity, 72) }));
  }
  if (reason === 'nan') {
    next.filter = { ...next.filter, type: 'svf', mode: 'lowpass', cutoffHz: 1200, resonance: 0.7, envelopeAmount: 0, keytrack: 0 };
    next.glideSeconds = 0;
    next.lfos = next.lfos.map((lfo) => ({ ...lfo, depth: 0 }));
    next.effects = next.effects.map((effect) => ({ ...effect, params: { ...effect.params, mix: 0, drive: 1 } }));
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
      const messages = instrumentMessages(input.user, input.feedback);
      return completeRaw(settings, messages.user, trace, { system: messages.system, jsonSchema: INSTRUMENT_JSON_SCHEMA });
    },
  };
}

const FATAL = new Set(['MODEL_HTTP', 'NOT_CONFIGURED', 'MODEL_SECRET', 'MODEL_URL']);

export async function runInstrumentAgent(
  prompt: string,
  options: {
    maxAttempts: number;
    model?: InstrumentModel;
    render?: (doc: PromptInstrument) => Promise<{ peak: number; nan: boolean }>;
    onStage?: (stage: InstrumentStage) => void;
  },
  trace?: Trace,
): Promise<{ document: PromptInstrument; hash: string; rack: string; dsl: string; attempts: number; provider: 'mock' | 'remote'; adjusted: boolean }> {
  const text = prompt.trim();
  if (!text) throw new AgentError('AGENT_EMPTY', 'AGENT_EMPTY: the prompt is empty');
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 4) {
    throw new AgentError('AGENT_BUDGET', 'AGENT_BUDGET: maxAttempts must be an integer from 1 to 4');
  }
  const model = options.model ?? new MockInstrumentModel();
  const render = options.render ?? ((doc: PromptInstrument) => renderPromptGraph(doc, trace));
  let candidate: PromptInstrument | null = null;
  let feedback = '';
  let adjusted = false;
  let lastReason = 'AGENT_VALIDATE';
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    options.onStage?.({ stage: 'plan', attempt, detail: feedback || 'Reading the prompt against the schema' });
    trace?.event('agent.stage', { stage: 'plan', attempt, ok: true });
    let doc: PromptInstrument;
    try {
      if (candidate) {
        doc = candidate;
        candidate = null;
        options.onStage?.({ stage: 'build', attempt, detail: 'Auto-adjusted the previous render' });
      } else {
        const raw = await model.complete({ user: text, feedback });
        doc = parsePromptInstrument(raw);
        options.onStage?.({ stage: 'build', attempt, detail: `${doc.name}: ${doc.oscillators.map((osc) => osc.wave).join('+')}` });
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
        feedback = `render ${reason}`;
        adjusted = true;
        candidate = repairInstrument(doc, reason);
        options.onStage?.({ stage: 'repair', attempt, detail: `auto-adjusted: ${reason}` });
        trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: false });
        continue;
      }
      const hash = await sha256Hex(canonicalize(doc));
      trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: true });
      trace?.event('agent.audition', { hash, attempt });
      return { document: doc, hash, rack, dsl: instrumentDsl(doc), attempts: attempt, provider: model.provider, adjusted };
    } catch (error) {
      if (error instanceof AgentError && FATAL.has(error.code)) throw error;
      lastReason = error instanceof Error ? error.message : 'error';
      feedback = lastReason;
      candidate = null;
      options.onStage?.({ stage: 'repair', attempt, detail: feedback });
      trace?.event('agent.turn', { attempt, maxAttempts: options.maxAttempts, ok: false });
      trace?.event('agent.stage', { stage: 'repair', attempt, ok: false });
    }
  }
  trace?.event('agent.audition', { hash: '', attempt: options.maxAttempts, ok: false });
  throw new AgentError('AGENT_BUDGET', `AGENT_BUDGET: stopped after ${options.maxAttempts} attempts (${feedback || lastReason})`);
}
