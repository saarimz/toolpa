import { sha256Hex } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { decodeMp3 } from './mp3.ts';
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
  trace?.event('source.load', { format: 'wav', bytes: bytes.byteLength });
  const span = trace?.span('wav.decode', { format: 'wav' });
  const sha256 = await sha256Hex(bytes);
  const decoded = decodeWav(bytes);
  span?.end({ frames: decoded.frames, sampleRate: decoded.sampleRate });
  trace?.event('source.decode', { format: 'wav', sha256, frames: decoded.frames });
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

export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

export async function decodeSample(bytes: Uint8Array, trace?: Trace): Promise<DecodedSample> {
  if (looksLikeWav(bytes)) return decodeWavSample(bytes, trace);
  if (looksLikeMp3(bytes)) return decodeMp3Sample(bytes, trace);
  throw new SampleError('format', 'sample must be WAV or MP3');
}

export async function decodeMp3Sample(bytes: Uint8Array, trace?: Trace): Promise<DecodedSample> {
  const started = performance.now();
  trace?.event('source.load', { format: 'mp3', bytes: bytes.byteLength });
  const span = trace?.span('source.decode', { format: 'mp3' });
  const sha256 = await sha256Hex(bytes);
  const decoded = await decodeMp3(bytes);
  span?.end({ frames: decoded.frames, sampleRate: decoded.sampleRate });
  const decodeMs = performance.now() - started;
  trace?.event('sample.decoded', {
    format: 'mp3',
    sha256,
    sampleRate: decoded.sampleRate,
    channels: decoded.channels,
    frames: decoded.frames,
  });
  trace?.metric('decode.ms', decodeMs, 'ms', { format: 'mp3', sha256 });
  return { ...decoded, sha256, format: 'mp3', decodeMs };
}
