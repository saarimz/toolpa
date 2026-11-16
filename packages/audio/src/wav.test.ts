import { decodeWav } from '@toolpa/samples';
import { describe, expect, it } from 'vitest';
import { ITOK_VERSION, encodeWav, encodeWavPcm16, readItok, type WavFormat } from './wav.ts';

const hash = 'ab'.repeat(32);

function foreignPcm(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = 0;
  let bits = 0;
  let data = new Uint8Array();
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(start, true);
      bits = view.getUint16(start + 14, true);
    } else if (id === 'data') data = bytes.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = bits / 8;
  const frames = Math.floor(data.byteLength / width);
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const at = i * width;
    if (format === 3) pcm[i] = dataView.getFloat32(at, true);
    else if (bits === 16) pcm[i] = dataView.getInt16(at, true) / 32768;
    else {
      let value = data[at] | ((data[at + 1] ?? 0) << 8) | ((data[at + 2] ?? 0) << 16);
      if (value & 0x800000) value |= ~0xffffff;
      pcm[i] = value / 8388608;
    }
  }
  return pcm;
}

describe('wav export', () => {
  it('writes pcm16, pcm24, and float32 deterministically and reads them back', () => {
    const pcm = new Float32Array(8);
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.sin(i) * 0.8;
    const formats: WavFormat[] = ['pcm16', 'pcm24', 'float32'];
    for (const format of formats) {
      const first = encodeWav(pcm, 48_000, { format, documentHash: hash });
      const second = encodeWav(pcm, 48_000, { format, documentHash: hash });
      expect(second).toEqual(first);
      const itok = readItok(first);
      expect(itok).toEqual({ version: ITOK_VERSION, hash });
      const decoded = decodeWav(first);
      expect(decoded.sampleRate).toBe(48_000);
      expect(decoded.frames).toBe(pcm.length);
      if (format === 'float32') {
        expect(decoded.pcm).toEqual(pcm);
        expect(String.fromCharCode(...first.subarray(36, 40))).toBe('fact');
      } else {
        for (let i = 0; i < pcm.length; i += 1) expect(Math.abs((decoded.pcm[i] ?? 0) - (pcm[i] ?? 0))).toBeLessThan(1 / 32768 + 1e-6);
      }
      const foreign = foreignPcm(first);
      expect(foreign.length).toBe(decoded.frames);
      for (let i = 0; i < foreign.length; i += 1) expect(foreign[i]).toBe(decoded.pcm[i]);
    }
  });

  it('keeps a pcm24 round trip inside one least significant bit', () => {
    const pcm = new Float32Array([-1, -0.5, -0.001, 0, 0.001, 0.5, 1]);
    const wav = encodeWav(pcm, 48_000, { format: 'pcm24', documentHash: hash });
    const decoded = decodeWav(wav);
    for (let i = 0; i < pcm.length; i += 1) {
      const written = Math.max(-8_388_608, Math.min(8_388_607, Math.round((pcm[i] ?? 0) * 8_388_607)));
      const read = Math.round((decoded.pcm[i] ?? 0) * 8_388_608);
      expect(Math.abs(read - written)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a pcm16 round trip inside one least significant bit', () => {
    const pcm = new Float32Array([-1, -0.25, 0, 0.25, 1]);
    const wav = encodeWav(pcm, 48_000, { format: 'pcm16' });
    expect(readItok(wav)).toBeNull();
    const decoded = decodeWav(wav);
    for (let i = 0; i < pcm.length; i += 1) {
      const written = Math.max(-32_768, Math.min(32_767, Math.round((pcm[i] ?? 0) * 32_767)));
      const read = Math.round((decoded.pcm[i] ?? 0) * 32_768);
      expect(Math.abs(read - written)).toBeLessThanOrEqual(1);
    }
    const legacy = encodeWavPcm16(pcm, 48_000);
    expect(wav).toEqual(legacy);
  });
});