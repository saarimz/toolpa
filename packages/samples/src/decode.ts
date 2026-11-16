import { sha256Hex } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { SampleError, decodeWav, type WavPcm } from './wav.ts';

export interface DecodedSample extends WavPcm {
  sha256: string;
  format: 'wav' | 'mp3';
  decodeMs: number;
}

export async function identifyBytes(bytes: Uint8Array): Promise<string> {
  return sha256Hex(bytes);
}

export async function decodeWavSample(bytes: Uint8Array, trace?: Trace): Promise<DecodedSample> {
  const started = performance.now();
  const sha256 = await sha256Hex(bytes);
  const decoded = decodeWav(bytes);
  const decodeMs = performance.now() - started;
  trace?.event('sample.decoded', {
    format: 'wav',
    sha256,
    sampleRate: decoded.sampleRate,
    channels: decoded.channels,
    frames: decoded.frames,
  });
  trace?.metric('decode.ms', decodeMs, 'ms', { format: 'wav', sha256 });
  return { ...decoded, sha256, format: 'wav', decodeMs };
}

export function looksLikeWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  const wave = String.fromCharCode(...bytes.subarray(8, 12));
  return head === 'RIFF' && wave === 'WAVE';
}

export function assertSample(bytes: Uint8Array): void {
  if (!looksLikeWav(bytes)) throw new SampleError('format', 'only WAV is decoded in this step');
}
