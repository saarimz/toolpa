import { MemoryRing, createTrace, installNetworkGuard } from '@toolpa/trace';
import { DurableStore, lineage, sealArtifact } from '../src/index.ts';

const ring = new MemoryRing(128);
const { trace } = createTrace({ ring });
installNetworkGuard({ trace });

const chain = {
  kind: 'chain',
  version: 1,
  sampleRate: 44100,
  source: { type: 'sine', frequencyHz: 440 },
  effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
};

const api = {
  snapshot: () => ring.snapshot(),
  async roundTrip() {
    const steps: string[] = [];
    try {
    steps.push('open');
    const store = await DurableStore.open(trace);
    const parent = await sealArtifact({ chain }, trace);
    steps.push('save-parent');
    await store.save(parent);
    const childChain = {
      ...chain,
      effect: { ...chain.effect, gain: 0.5 },
    };
    const child = await sealArtifact({ chain: childChain, parents: [parent.id] }, trace);
    await store.save(child);
    const sample = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const sampleId = await crypto.subtle.digest('SHA-256', sample);
    const sha256 = [...new Uint8Array(sampleId)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    await store.saveSample(sha256, sample);
    const again = await DurableStore.open(trace);
    const loaded = await again.load(child.id);
    const walked = await lineage(again, child.id);
    const sampleBytes = await again.loadSample(sha256);
    const missing = await again.loadSample('b'.repeat(64));
    return {
      ok: true as const,
      steps,
      childId: child.id,
      parentId: parent.id,
      loadedParents: loaded?.artifact.parents ?? [],
      walked,
      sampleBytes: sampleBytes ? [...sampleBytes] : null,
      missing,
      listed: (await again.list()).includes(child.id) && (await again.list()).includes(parent.id),
      backend: again.backend,
    };
    } catch (error) {
      return {
        ok: false as const,
        steps,
        message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
  },
};

declare global {
  interface Window {
    __toolpaOpfs: typeof api;
  }
}

window.__toolpaOpfs = api;
