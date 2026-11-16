import { describe, expect, it } from 'vitest';
import { sealArtifact } from './artifact.ts';
import { isZipToolpa, openStoredArtifact, zipForEnvelope } from './stored.ts';

const chain = {
  kind: 'chain',
  version: 1,
  sampleRate: 44100,
  source: { type: 'sine', frequencyHz: 440 },
  effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
};

describe('stored .toolpa bytes', () => {
  it('writes a zip and still reads an older JSON envelope', async () => {
    const parent = await sealArtifact({ chain });
    const child = await sealArtifact({
      chain: { ...chain, effect: { ...chain.effect, gain: 0.5 } },
      parents: [parent.id],
    });
    const zipped = await zipForEnvelope(child);
    expect(isZipToolpa(zipped)).toBe(true);
    const opened = await openStoredArtifact(zipped);
    expect(opened.id).toBe(child.id);
    expect(opened.artifact.parents).toEqual([parent.id]);
    expect(opened.artifact.chain).toEqual(child.artifact.chain);

    const legacy = await openStoredArtifact(child.bytes);
    expect(isZipToolpa(child.bytes)).toBe(false);
    expect(legacy.id).toBe(child.id);
    expect(legacy.artifact.parents).toEqual([parent.id]);
  });
});
