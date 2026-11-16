import { createTrace } from '@toolpa/trace';
import { decodeWavSample } from '@toolpa/samples';
import { describe, expect, it } from 'vitest';
import { SampleError } from '@toolpa/samples';
import { bufferFor, renderKeyedSample } from './sample.ts';

const tone = { type: 'tone' as const, cutoffHz: 8000, q: 0.7071067811865476, gain: 1 };

function wavFrom(pcm: Float32Array, sampleRate: number): Uint8Array {
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
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return new Uint8Array(buffer);
}

describe('sample source', () => {
  it('plays the buffer stored under the file SHA-256', async () => {
    const original = new Float32Array(2000);
    for (let i = 0; i < original.length; i += 1) original[i] = Math.sin((2 * Math.PI * 220 * i) / 44100);
    const decoded = await decodeWavSample(wavFrom(original, 44100));
    const samples = new Map([[decoded.sha256, decoded.pcm]]);
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const rendered = await renderKeyedSample(
      {
        sha256: decoded.sha256,
        samples,
        playbackRate: 1,
        sampleRate: 44100,
        frames: 3000,
        effect: tone,
      },
      trace,
    );
    const again = await renderKeyedSample({
      sha256: decoded.sha256,
      samples,
      playbackRate: 1,
      sampleRate: 44100,
      frames: 3000,
      effect: tone,
    });
    expect(again).toEqual(rendered);
    let peak = 0;
    for (let i = 0; i < rendered.length; i += 1) peak = Math.max(peak, Math.abs(rendered[i] ?? 0));
    expect(peak).toBeGreaterThan(0.2);
    const event = lines
      .map((line) => JSON.parse(line.trim()))
      .find((record) => record.name === 'source.sample');
    expect(event.fields.sha256).toBe(decoded.sha256);
  });

  it('refuses to render a hash that has no buffer', () => {
    expect(() => bufferFor('a'.repeat(64), new Map())).toThrow(SampleError);
  });
});
