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
