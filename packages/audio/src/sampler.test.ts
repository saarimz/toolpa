import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { SamplerError, parseSfz, pickZone, renderZone } from './sampler.ts';

const sha = 'cd'.repeat(32);

describe('sampler zones', () => {
  it('imports an SFZ region and loops the matching velocity layer', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const zones = parseSfz(
      `<group>\n<region>\nsample=samples/${sha}.wav\nlokey=60\nhikey=72\nlovel=1\nhivel=90\nloop_start=4\nloop_end=28\n<region>\nsample=samples/${'ef'.repeat(32)}.wav\nlokey=60\nhikey=72\nlovel=91\nhivel=127\nloop_start=0\nloop_end=8\n`,
    );
    expect(pickZone(zones, 64, 40).sha256).toBe(sha);
    expect(pickZone(zones, 64, 100).sha256).not.toBe(sha);
    const pcm = new Float32Array(32);
    for (let index = 0; index < pcm.length; index += 1) pcm[index] = index >= 4 && index < 28 ? 0.4 : 0;
    const first = await renderZone(pickZone(zones, 64, 40), pcm, trace);
    const second = await renderZone(pickZone(zones, 64, 40), pcm);
    expect(first.wavSha256).toBe(second.wavSha256);
    expect(first.peak).toBeGreaterThan(0.05);
    expect(() => parseSfz('<region>\nsample=notes.wav\n')).toThrow(SamplerError);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('sampler.zone');
  });
});
