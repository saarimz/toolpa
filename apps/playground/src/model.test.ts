import { hashChain } from '@toolpa/graph';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cutoffFromSlider, cutoffToSlider, playgroundChain } from './model.ts';

const tone = { cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 };

describe('playground chain', () => {
  it('hashes the default sine chain to the offline golden', async () => {
    const draft = playgroundChain({
      sampleRate: 44100,
      source: 'sine',
      frequencyHz: 440,
      seed: 11,
      sha256: '',
      playbackRate: 1,
      ...tone,
    });
    if (!('chain' in draft)) throw new Error(draft.error);
    const golden = JSON.parse(
      readFileSync(new URL('../../../packages/audio/goldens/sine.json', import.meta.url), 'utf8'),
    ) as { hash: string };
    const { hash } = await hashChain(draft.chain);
    expect(hash).toBe(golden.hash);
  });

  it('rejects a sample chain until a file identity exists', () => {
    const draft = playgroundChain({
      sampleRate: 44100,
      source: 'sample',
      frequencyHz: 440,
      seed: 11,
      sha256: '',
      playbackRate: 1,
      ...tone,
    });
    expect('error' in draft).toBe(true);
  });

  it('maps the cutoff slider onto the tone range', () => {
    expect(Math.abs(cutoffFromSlider(cutoffToSlider(2000)) - 2000)).toBeLessThan(20);
    expect(cutoffFromSlider(0)).toBe(20);
    expect(cutoffFromSlider(1000)).toBe(20000);
  });
});
