export const ITOK_VERSION = 1;
export type WavFormat = 'pcm16' | 'pcm24' | 'float32';

export interface Itok {
  version: number;
  hash: string;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function chunk(id: string, payload: Uint8Array): Uint8Array {
  const padded = payload.byteLength + (payload.byteLength % 2);
  const out = new Uint8Array(8 + padded);
  const view = new DataView(out.buffer);
  writeAscii(view, 0, id);
  view.setUint32(4, payload.byteLength, true);
  out.set(payload, 8);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('document hash must be 64 lowercase hex characters');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodePcm16(pcm: Float32Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    const integer = Math.max(-32_768, Math.min(32_767, Math.round(sample * 32_767)));
    view.setInt16(i * 2, integer, true);
  }
  return out;
}

function encodePcm24(pcm: Float32Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 3);
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    const integer = Math.max(-8_388_608, Math.min(8_388_607, Math.round(sample * 8_388_607)));
    const unsigned = integer < 0 ? integer + 16_777_216 : integer;
    out[i * 3] = unsigned & 0xff;
    out[i * 3 + 1] = (unsigned >> 8) & 0xff;
    out[i * 3 + 2] = (unsigned >> 16) & 0xff;
  }
  return out;
}

function encodeFloat32(pcm: Float32Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < pcm.length; i += 1) view.setFloat32(i * 4, pcm[i] ?? 0, true);
  return out;
}

export function encodeWav(
  pcm: Float32Array,
  sampleRate: number,
  options: { format?: WavFormat; documentHash?: string } = {},
): Uint8Array {
  const format = options.format ?? 'pcm16';
  const data = format === 'float32' ? encodeFloat32(pcm) : format === 'pcm24' ? encodePcm24(pcm) : encodePcm16(pcm);
  const bits = format === 'float32' ? 32 : format === 'pcm24' ? 24 : 16;
  const tag = format === 'float32' ? 3 : 1;
  const blockAlign = bits / 8;
  const fmt = new Uint8Array(16);
  const fmtView = new DataView(fmt.buffer);
  fmtView.setUint16(0, tag, true);
  fmtView.setUint16(2, 1, true);
  fmtView.setUint32(4, sampleRate, true);
  fmtView.setUint32(8, sampleRate * blockAlign, true);
  fmtView.setUint16(12, blockAlign, true);
  fmtView.setUint16(14, bits, true);
  const parts = [chunk('fmt ', fmt)];
  if (format === 'float32') {
    const fact = new Uint8Array(4);
    new DataView(fact.buffer).setUint32(0, pcm.length, true);
    parts.push(chunk('fact', fact));
  }
  if (options.documentHash) {
    const payload = new Uint8Array(34);
    const view = new DataView(payload.buffer);
    view.setUint16(0, ITOK_VERSION, true);
    payload.set(hexToBytes(options.documentHash), 2);
    parts.push(chunk('ITOK', payload));
  }
  parts.push(chunk('data', data));
  const body = parts.reduce((sum, part) => sum + part.byteLength, 4);
  const out = new Uint8Array(8 + body);
  const view = new DataView(out.buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, body, true);
  writeAscii(view, 8, 'WAVE');
  let offset = 12;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function readItok(bytes: Uint8Array): Itok | null {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 82 || bytes[8] !== 87) return null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.byteLength) return null;
    if (id === 'ITOK' && size >= 34) {
      return { version: view.getUint16(start, true), hash: bytesToHex(bytes.subarray(start + 2, start + 34)) };
    }
    offset = start + size + (size % 2);
  }
  return null;
}

export function encodeWavPcm16(pcm: Float32Array, sampleRate: number): Uint8Array {
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
    const integer = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(44 + i * 2, integer, true);
  }
  return new Uint8Array(buffer);
}

export function resampleLinear(pcm: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || pcm.length === 0) return pcm;
  const frames = Math.max(1, Math.round((pcm.length * toRate) / fromRate));
  const out = new Float32Array(frames);
  const scale = fromRate / toRate;
  for (let i = 0; i < frames; i += 1) {
    const position = i * scale;
    const left = Math.floor(position);
    const right = Math.min(pcm.length - 1, left + 1);
    const fraction = position - left;
    const a = pcm[left] ?? 0;
    const b = pcm[right] ?? 0;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}
