export class SampleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SampleError';
  }
}

export interface WavPcm {
  sampleRate: number;
  channels: number;
  frames: number;
  pcm: Float32Array;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(bytes[offset + i] ?? 0);
  return text;
}

export function decodeWav(bytes: Uint8Array): WavPcm {
  if (bytes.byteLength < 44) throw new SampleError('wav', 'WAV is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    throw new SampleError('wav', 'not a RIFF WAVE file');
  }

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data: Uint8Array | undefined;

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.byteLength) throw new SampleError('wav', `chunk ${id} overruns the file`);
    if (id === 'fmt ') {
      if (size < 16) throw new SampleError('wav', 'fmt chunk is too small');
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bits = view.getUint16(start + 14, true);
    } else if (id === 'data') {
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }

  if (format !== 1 && format !== 3) throw new SampleError('wav', `unsupported WAV format ${format}`);
  if (channels < 1 || channels > 2) throw new SampleError('wav', 'WAV must be mono or stereo');
  if (sampleRate < 8_000 || sampleRate > 96_000) throw new SampleError('wav', 'WAV sample rate is out of range');
  if (!data) throw new SampleError('wav', 'WAV is missing a data chunk');

  const bytesPerSample = bits / 8;
  if (![2, 3, 4].includes(bytesPerSample)) throw new SampleError('wav', `unsupported bit depth ${bits}`);
  const block = bytesPerSample * channels;
  const frames = Math.floor(data.byteLength / block);
  const pcm = new Float32Array(frames);
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = frame * block + channel * bytesPerSample;
      sum += readSample(dataView, at, format, bits);
    }
    pcm[frame] = sum / channels;
  }

  return { sampleRate, channels, frames, pcm };
}

function readSample(view: DataView, offset: number, format: number, bits: number): number {
  if (format === 3 && bits === 32) return view.getFloat32(offset, true);
  if (format === 1 && bits === 16) return view.getInt16(offset, true) / 32768;
  if (format === 1 && bits === 24) {
    const b0 = view.getUint8(offset);
    const b1 = view.getUint8(offset + 1);
    const b2 = view.getUint8(offset + 2);
    let value = b0 | (b1 << 8) | (b2 << 16);
    if (value & 0x800000) value |= ~0xffffff;
    return value / 8388608;
  }
  if (format === 1 && bits === 32) return view.getInt32(offset, true) / 2147483648;
  throw new SampleError('wav', `cannot read ${bits}-bit format ${format}`);
}
