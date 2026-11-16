import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { SampleError, decodeWavSample, identifyBytes } from './index.ts';

function encodePcm16Wav(samples: Float32Array, sampleRate: number, channels = 1): Uint8Array {
  const dataBytes = samples.length * 2;
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
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buffer);
}

describe('WAV samples', () => {
  it('keys a buffer by the SHA-256 of the file bytes and records decode time', async () => {
    const pcm = new Float32Array(64);
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
    const wav = encodePcm16Wav(pcm, 44100);
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });

    const decoded = await decodeWavSample(wav, trace);
    const again = await decodeWavSample(wav);

    expect(decoded.sha256).toBe(await identifyBytes(wav));
    expect(decoded.sha256).toBe(again.sha256);
    expect(decoded.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels).toBe(1);
    expect(decoded.frames).toBe(64);
    expect(decoded.pcm[0]).toBeCloseTo(0, 4);
    expect(decoded.pcm[10]).toBeCloseTo(pcm[10] ?? 0, 3);
    expect(decoded.decodeMs).toBeGreaterThanOrEqual(0);

    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.some((record) => record.name === 'sample.decoded' && record.fields.sha256 === decoded.sha256)).toBe(
      true,
    );
    const timing = records.find((record) => record.name === 'decode.ms');
    expect(timing.unit).toBe('ms');
    expect(timing.fields.format).toBe('wav');
  });

  it('mixes stereo to mono and rejects a truncated file', async () => {
    const stereo = encodePcm16Wav(new Float32Array([0.5, -0.5, 0.25, -0.25]), 44100, 2);
    const decoded = await decodeWavSample(stereo);
    expect(decoded.channels).toBe(2);
    expect(decoded.frames).toBe(2);
    expect(decoded.pcm[0]).toBeCloseTo(0, 4);
    expect(decoded.pcm[1]).toBeCloseTo(0, 4);
    await expect(decodeWavSample(stereo.subarray(0, 20))).rejects.toBeInstanceOf(SampleError);
    const eightBit = encodePcm16Wav(new Float32Array([0.1, -0.1]), 44100);
    const view = new DataView(eightBit.buffer);
    view.setUint16(34, 8, true);
    await expect(decodeWavSample(eightBit)).rejects.toThrow(/WAV_UNSUPPORTED_FORMAT/);
  });
});
