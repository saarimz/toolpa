import { ChainError, parseChain, type Chain } from '@toolpa/graph';

export interface PlaygroundInput {
  sampleRate: number;
  source: 'sine' | 'noise' | 'sample';
  frequencyHz: number | null;
  seed: number | null;
  sha256: string;
  playbackRate: number | null;
  cutoffHz: number;
  q: number;
  gain: number;
}

export function playgroundChain(input: PlaygroundInput): { chain: Chain } | { error: string } {
  const source =
    input.source === 'sine'
      ? { type: 'sine' as const, frequencyHz: input.frequencyHz }
      : input.source === 'noise'
        ? { type: 'noise' as const, seed: input.seed }
        : { type: 'sample' as const, sha256: input.sha256, playbackRate: input.playbackRate };
  try {
    return {
      chain: parseChain({
        kind: 'chain',
        version: 1,
        sampleRate: input.sampleRate,
        source,
        effect: { type: 'tone', cutoffHz: input.cutoffHz, q: input.q, gain: input.gain },
      }),
    };
  } catch (error) {
    if (error instanceof ChainError) return { error: error.message };
    throw error;
  }
}

export function cutoffFromSlider(position: number): number {
  const min = Math.log(20);
  const max = Math.log(20_000);
  return Math.round(Math.exp(min + ((max - min) * position) / 1000));
}

export function cutoffToSlider(hz: number): number {
  const min = Math.log(20);
  const max = Math.log(20_000);
  return Math.round(((Math.log(Math.min(20_000, Math.max(20, hz))) - min) / (max - min)) * 1000);
}
