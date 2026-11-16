import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { ChainError, hashChain, parseChain } from './index.ts';

const tone = { type: 'tone' as const, cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 };

function sineChain(frequencyHz = 440, extra?: Record<string, unknown>) {
  return {
    version: 1,
    sampleRate: 44100,
    effect: tone,
    kind: 'chain',
    source: { frequencyHz, type: 'sine' },
    ...extra,
  };
}

describe('chain', () => {
  it('hashes the same document no matter the key order', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const a = await hashChain(sineChain(), trace);
    const b = await hashChain({
      source: { type: 'sine', frequencyHz: 440 },
      effect: { gain: 0.25, q: 0.7071067811865476, cutoffHz: 2000, type: 'tone' },
      sampleRate: 44100,
      version: 1,
      kind: 'chain',
    });
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.canonical.startsWith('{"effect":')).toBe(true);
    const hashed = lines.map((line) => JSON.parse(line.trim())).find((record) => record.name === 'graph.hashed');
    expect(hashed.fields).toMatchObject({ hash: a.hash, kind: 'chain', source: 'sine', sampleRate: 44100 });
  });

  it('changes the hash when the tone cutoff changes', async () => {
    const base = await hashChain(sineChain());
    const darker = await hashChain({ ...sineChain(), effect: { ...tone, cutoffHz: 400 } });
    expect(darker.hash).not.toBe(base.hash);
  });

  it('accepts noise and sample sources and rejects anything else', async () => {
    const noise = parseChain({
      kind: 'chain',
      version: 1,
      sampleRate: 48000,
      source: { type: 'noise', seed: 7 },
      effect: tone,
    });
    expect(noise.source).toEqual({ type: 'noise', seed: 7 });

    const sample = parseChain({
      kind: 'chain',
      version: 1,
      sampleRate: 44100,
      source: { type: 'sample', sha256: 'a'.repeat(64), playbackRate: 1 },
      effect: tone,
    });
    expect(sample.source.type).toBe('sample');

    expect(() => parseChain({ ...sineChain(), kind: 'voice' })).toThrow(ChainError);
    expect(() => parseChain({ ...sineChain(), voices: [] })).not.toThrow();
    expect(() => parseChain({ ...sineChain(), voices: [{ type: 'sine' }] })).toThrow(/SLICE_UNSUPPORTED/);
    expect(() => parseChain({ ...sineChain(), subpatch: { type: 'subpatch' } })).toThrow(/SLICE_UNSUPPORTED/);
    expect(() => parseChain({ ...sineChain(), source: { type: 'subpatch' } })).toThrow(/SLICE_UNSUPPORTED/);
    expect(() => parseChain({ ...sineChain(), source: { type: 'sine', frequencyHz: 0 } })).toThrow(/frequencyHz/);
    await expect(hashChain({ ...sineChain(), source: { type: 'sample', sha256: 'ZZ', playbackRate: 1 } })).rejects.toThrow(
      /sha256/,
    );
  });
});
