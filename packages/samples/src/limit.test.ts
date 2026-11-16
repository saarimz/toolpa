import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { MAX_SAMPLE_BYTES, assertSampleSize, decodeSample, decodeWavSample } from './index.ts';

function pcm16Wav(): Uint8Array {
  const pcm = new Float32Array([0, 0.5, 0, -0.5]);
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 88200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(buffer);
}

describe('sample size cap', () => {
  it('accepts a file at 50 MB and rejects one byte over it before decode', async () => {
    expect(() => assertSampleSize(MAX_SAMPLE_BYTES)).not.toThrow();
    expect(() => assertSampleSize(MAX_SAMPLE_BYTES + 1)).toThrow(/LOADER_TOO_LARGE/);
    await expect(decodeSample(pcm16Wav())).resolves.toMatchObject({ frames: 4 });

    const over = new Uint8Array(MAX_SAMPLE_BYTES + 1);
    over.set(new TextEncoder().encode('RIFF'));
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    await expect(decodeWavSample(over, trace)).rejects.toThrow(/LOADER_TOO_LARGE/);
    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.some((record) => record.name === 'source.load' && record.fields.code === 'LOADER_TOO_LARGE')).toBe(true);
    expect(records.some((record) => record.name === 'error' && record.fields.code === 'LOADER_TOO_LARGE')).toBe(true);
    expect(records.some((record) => record.name === 'sample.decoded')).toBe(false);
  });
});