import { decodeSample } from '../src/index.ts';

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function rms(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let energy = 0;
  const start = Math.floor(pcm.length * 0.25);
  const end = Math.max(start + 1, Math.floor(pcm.length * 0.75));
  for (let i = start; i < end; i += 1) energy += (pcm[i] ?? 0) ** 2;
  return Math.sqrt(energy / (end - start));
}

const api = {
  async decode(base64: string) {
    const decoded = await decodeSample(bytesFromBase64(base64));
    return {
      sha256: decoded.sha256,
      format: decoded.format,
      sampleRate: decoded.sampleRate,
      frames: decoded.frames,
      decodeMs: decoded.decodeMs,
      rms: rms(decoded.pcm),
    };
  },
  async nativeMp3(base64: string) {
    const bytes = bytesFromBase64(base64);
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const context = new AudioContext();
    try {
      const audio = await context.decodeAudioData(copy);
      return { ok: true as const, sampleRate: audio.sampleRate, frames: audio.length };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : String(error) };
    } finally {
      await context.close();
    }
  },
};

declare global {
  interface Window {
    __toolpaSamples: typeof api;
  }
}

window.__toolpaSamples = api;
