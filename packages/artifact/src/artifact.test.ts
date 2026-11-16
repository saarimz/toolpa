import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { ArtifactError, MemoryStore, lineage, openArtifact, sealArtifact } from './index.ts';

const chain = {
  kind: 'chain',
  version: 1,
  sampleRate: 44100,
  source: { type: 'sine', frequencyHz: 440 },
  effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
};

describe('toolpa artifact', () => {
  it('addresses a chain by the hash of its canonical bytes', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const first = await sealArtifact({ chain }, trace);
    const second = await sealArtifact({ chain: { ...chain, effect: { ...chain.effect } } });
    expect(second.id).toBe(first.id);
    expect(new TextDecoder().decode(first.bytes).startsWith('{"chain":')).toBe(true);
    const opened = await openArtifact(first.bytes);
    expect(opened.id).toBe(first.id);
    expect(opened.artifact.chain).toEqual(first.artifact.chain);

    const child = await sealArtifact({ chain, parents: [first.id] });
    expect(child.id).not.toBe(first.id);
    const reversed = await sealArtifact({ chain, parents: [child.id, first.id] });
    const flipped = await sealArtifact({ chain, parents: [first.id, child.id] });
    expect(reversed.id).not.toBe(flipped.id);

    const store = new MemoryStore(trace);
    await store.save(first);
    await store.save(child);
    expect((await store.load(child.id))?.artifact.parents).toEqual([first.id]);
    expect(await lineage(store, child.id)).toEqual([child.id, first.id]);
    await expect(lineage(store, 'a'.repeat(64))).rejects.toBeInstanceOf(ArtifactError);

    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.some((record) => record.name === 'artifact.sealed' && record.fields.id === first.id)).toBe(true);
    expect(records.some((record) => record.name === 'artifact.saved')).toBe(true);
    expect(records.some((record) => record.name === 'artifact.loaded')).toBe(true);
  });

  it('rejects a sample blob whose bytes do not match the key', async () => {
    const store = new MemoryStore();
    await expect(store.saveSample('a'.repeat(64), new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(ArtifactError);
  });
});
