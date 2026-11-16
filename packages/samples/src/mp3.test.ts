import { createTrace } from '@toolpa/trace';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMp3Sample, decodeSample, identifyBytes } from './index.ts';

const fixture = new Uint8Array(readFileSync(new URL('../fixtures/tone.mp3', import.meta.url)));

describe('MP3 samples', () => {
  it('keys the file by SHA-256 and decodes audible PCM', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const decoded = await decodeMp3Sample(fixture, trace);
    const again = await decodeSample(fixture);

    expect(decoded.format).toBe('mp3');
    expect(decoded.sha256).toBe(await identifyBytes(fixture));
    expect(again.sha256).toBe(decoded.sha256);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.frames).toBeGreaterThan(1000);
    expect(again.pcm).toEqual(decoded.pcm);

    let energy = 0;
    const start = Math.floor(decoded.frames * 0.25);
    const end = Math.floor(decoded.frames * 0.75);
    for (let i = start; i < end; i += 1) energy += (decoded.pcm[i] ?? 0) ** 2;
    const rms = Math.sqrt(energy / (end - start));
    expect(rms).toBeGreaterThan(0.05);

    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.find((record) => record.name === 'sample.decoded')?.fields.format).toBe('mp3');
    expect(records.find((record) => record.name === 'decode.ms')?.unit).toBe('ms');
  });
});
