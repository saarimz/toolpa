import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { sha256Hex } from '@toolpa/graph';
import { sealArtifact } from './artifact.ts';
import { DurableStore, MemoryBucket, MemoryIndex } from './durable.ts';

const chain = {
  kind: 'chain',
  version: 1,
  sampleRate: 44100,
  source: { type: 'sine', frequencyHz: 440 },
  effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
};

describe('durable storage', () => {
  it('indexes an artifact and keeps the blob when OPFS is absent', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const store = new DurableStore(new MemoryBucket('idb'), new MemoryIndex(), trace);
    const sealed = await sealArtifact({ chain }, trace);
    await store.save(sealed);
    const loaded = await store.load(sealed.id);
    expect(loaded?.id).toBe(sealed.id);
    expect(loaded?.artifact.chain).toEqual(sealed.artifact.chain);
    expect(await store.list()).toEqual([sealed.id]);
    const sample = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const sha = await sha256Hex(sample);
    await store.saveSample(sha, sample);
    expect(await store.loadSample(sha)).toEqual(sample);
    expect(await store.loadSample('ab'.repeat(32))).toBeNull();
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('artifact.saved');
    expect(store.backend).toBe('idb');
  });
});