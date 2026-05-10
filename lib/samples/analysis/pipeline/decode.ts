export type DecodedAudio = {
  sampleRate: number;
  channels: Float32Array[];
  durationSec: number;
};

export async function decodeArrayBufferInBrowser(
  arrayBuffer: ArrayBuffer,
): Promise<DecodedAudio> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("OfflineAudioContext is not available in this runtime");
  }

  const probeContext = new OfflineAudioContext(1, 1, 44100);
  const audioBuffer = await probeContext.decodeAudioData(arrayBuffer.slice(0));
  return audioBufferToDecoded(audioBuffer);
}

export function audioBufferToDecoded(audioBuffer: AudioBuffer): DecodedAudio {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = new Float32Array(audioBuffer.length);
    audioBuffer.copyFromChannel(data, channel);
    channels.push(data);
  }

  return {
    sampleRate: audioBuffer.sampleRate,
    channels,
    durationSec: audioBuffer.duration,
  };
}

export function decodeWavInNode(arrayBuffer: ArrayBuffer): DecodedAudio {
  const view = new DataView(arrayBuffer);
  if (arrayBuffer.byteLength < 44) {
    throw new Error("WAV file is too small to contain a header");
  }

  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file");
  }

  let cursor = 12;
  let fmt: WavFormat | null = null;
  let data: { offset: number; length: number } | null = null;

  while (cursor + 8 <= arrayBuffer.byteLength) {
    const chunkId = readAscii(view, cursor, 4);
    const chunkSize = view.getUint32(cursor + 4, true);
    const payloadStart = cursor + 8;

    if (chunkId === "fmt ") {
      fmt = readFmt(view, payloadStart, chunkSize);
    } else if (chunkId === "data") {
      data = { offset: payloadStart, length: chunkSize };
      break;
    }

    cursor = payloadStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || !data) {
    throw new Error("WAV file is missing fmt or data chunk");
  }

  const channels = deinterleaveSamples(view, fmt, data.offset, data.length);
  return {
    sampleRate: fmt.sampleRate,
    channels,
    durationSec: channels[0].length / fmt.sampleRate,
  };
}

type WavFormat = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
};

function readFmt(view: DataView, offset: number, size: number): WavFormat {
  if (size < 16) {
    throw new Error("WAV fmt chunk is too small");
  }

  let audioFormat = view.getUint16(offset, true);
  const channels = view.getUint16(offset + 2, true);
  const sampleRate = view.getUint32(offset + 4, true);
  const blockAlign = view.getUint16(offset + 12, true);
  const bitsPerSample = view.getUint16(offset + 14, true);

  if (audioFormat === 0xfffe && size >= 40) {
    audioFormat = view.getUint16(offset + 24, true);
  }

  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Unsupported WAV audio format ${audioFormat}`);
  }

  return { audioFormat, channels, sampleRate, bitsPerSample, blockAlign };
}

function deinterleaveSamples(
  view: DataView,
  fmt: WavFormat,
  offset: number,
  length: number,
): Float32Array[] {
  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameSize = fmt.blockAlign || bytesPerSample * fmt.channels;
  const frameCount = Math.floor(length / frameSize);
  const channels = Array.from(
    { length: fmt.channels },
    () => new Float32Array(frameCount),
  );

  const reader = readerFor(fmt);

  for (let frame = 0; frame < frameCount; frame++) {
    const frameOffset = offset + frame * frameSize;
    for (let channel = 0; channel < fmt.channels; channel++) {
      channels[channel][frame] = reader(
        view,
        frameOffset + channel * bytesPerSample,
      );
    }
  }

  return channels;
}

function readerFor(fmt: WavFormat): (view: DataView, offset: number) => number {
  if (fmt.audioFormat === 3 && fmt.bitsPerSample === 32) {
    return (view, offset) => view.getFloat32(offset, true);
  }

  if (fmt.audioFormat === 1) {
    if (fmt.bitsPerSample === 16) {
      return (view, offset) => view.getInt16(offset, true) / 0x8000;
    }
    if (fmt.bitsPerSample === 24) {
      return (view, offset) => {
        const b0 = view.getUint8(offset);
        const b1 = view.getUint8(offset + 1);
        const b2 = view.getUint8(offset + 2);
        let value = (b2 << 16) | (b1 << 8) | b0;
        if (value & 0x800000) {
          value |= ~0xffffff;
        }
        return value / 0x800000;
      };
    }
    if (fmt.bitsPerSample === 32) {
      return (view, offset) => view.getInt32(offset, true) / 0x80000000;
    }
  }

  throw new Error(
    `Unsupported WAV format: audioFormat=${fmt.audioFormat} bits=${fmt.bitsPerSample}`,
  );
}

function readAscii(view: DataView, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length; index++) {
    result += String.fromCharCode(view.getUint8(offset + index));
  }
  return result;
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) {
    return channels[0];
  }

  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    let sum = 0;
    for (let channel = 0; channel < channels.length; channel++) {
      sum += channels[channel][index];
    }
    mono[index] = sum / channels.length;
  }
  return mono;
}
