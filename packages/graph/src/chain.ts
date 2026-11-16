import type { Trace } from '@toolpa/trace';
import { canonicalize, sha256Hex } from './codec.ts';

export const CHAIN_KIND = 'chain' as const;
export const CHAIN_VERSION = 1 as const;

export interface SineSource {
  type: 'sine';
  frequencyHz: number;
}

export interface NoiseSource {
  type: 'noise';
  seed: number;
}

export interface SampleSource {
  type: 'sample';
  sha256: string;
  playbackRate: number;
}

export type ChainSource = SineSource | NoiseSource | SampleSource;

export interface ToneEffect {
  type: 'tone';
  cutoffHz: number;
  q: number;
  gain: number;
}

export interface Chain {
  kind: typeof CHAIN_KIND;
  version: typeof CHAIN_VERSION;
  sampleRate: number;
  source: ChainSource;
  effect: ToneEffect;
}

export class ChainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ChainError';
  }
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

function parseSource(source: unknown): ChainSource {
  if (!source || typeof source !== 'object') throw new ChainError('source', 'source is required');
  const record = source as Record<string, unknown>;
  if (record.type === 'sine') {
    return { type: 'sine', frequencyHz: numberIn(record.frequencyHz, 'frequencyHz', 1, 20_000) };
  }
  if (record.type === 'noise') {
    return { type: 'noise', seed: integerIn(record.seed, 'seed', 0, 2_147_483_647) };
  }
  if (record.type === 'sample') {
    if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
      throw new ChainError('sample', 'sample sha256 must be 64 lowercase hex characters');
    }
    return {
      type: 'sample',
      sha256: record.sha256,
      playbackRate: numberIn(record.playbackRate, 'playbackRate', 0.25, 4),
    };
  }
  throw new ChainError('source', 'source type must be sine, noise, or sample');
}

function parseEffect(effect: unknown): ToneEffect {
  if (!effect || typeof effect !== 'object') throw new ChainError('effect', 'effect is required');
  const record = effect as Record<string, unknown>;
  if (record.type !== 'tone') throw new ChainError('effect', 'slice 1 only accepts the tone effect');
  return {
    type: 'tone',
    cutoffHz: numberIn(record.cutoffHz, 'cutoffHz', 20, 20_000),
    q: numberIn(record.q, 'q', 0.1, 18),
    gain: numberIn(record.gain, 'gain', 0, 1),
  };
}

function rejectOutsideSlice(record: Record<string, unknown>): void {
  if (Array.isArray(record.voices) && record.voices.length > 0) {
    throw new ChainError('SLICE_UNSUPPORTED', 'SLICE_UNSUPPORTED: graphs with voices are outside slice 1');
  }
  if ('subpatch' in record || 'subpatches' in record) {
    throw new ChainError('SLICE_UNSUPPORTED', 'SLICE_UNSUPPORTED: graphs with subpatches are outside slice 1');
  }
  for (const node of [record.source, record.effect]) {
    if (node && typeof node === 'object' && (node as { type?: unknown }).type === 'subpatch') {
      throw new ChainError('SLICE_UNSUPPORTED', 'SLICE_UNSUPPORTED: graphs with subpatches are outside slice 1');
    }
  }
}

export function parseChain(input: unknown): Chain {
  if (!input || typeof input !== 'object') throw new ChainError('chain', 'chain must be an object');
  const record = input as Record<string, unknown>;
  rejectOutsideSlice(record);
  if (record.kind !== CHAIN_KIND) throw new ChainError('kind', 'kind must be "chain"');
  if (record.version !== CHAIN_VERSION) throw new ChainError('version', 'version must be 1');
  return {
    kind: CHAIN_KIND,
    version: CHAIN_VERSION,
    sampleRate: integerIn(record.sampleRate, 'sampleRate', 8_000, 96_000),
    source: parseSource(record.source),
    effect: parseEffect(record.effect),
  };
}

export async function hashChain(
  input: unknown,
  trace?: Trace,
): Promise<{ chain: Chain; hash: string; canonical: string }> {
  const span = trace?.span('ir.validate', {});
  let chain: Chain;
  try {
    chain = parseChain(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof ChainError ? error.code : 'error';
    span?.fail({ code, message });
    throw error;
  }
  span?.end({ ok: true, errorCount: 0 });
  const canonical = canonicalize(chain);
  const hash = await sha256Hex(canonical);
  trace?.event('graph.hashed', {
    hash,
    kind: chain.kind,
    source: chain.source.type,
    sampleRate: chain.sampleRate,
  });
  trace?.event('ir.hash', { hash, kind: chain.kind, source: chain.source.type });
  return { chain, hash, canonical };
}
