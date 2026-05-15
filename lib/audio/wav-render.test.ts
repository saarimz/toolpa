import { describe, expect, it } from "vitest";

import {
  encodeAudioBufferToWav,
  normalizeAudioBufferPeak,
  WAV_EXPORT_TARGET_PEAK,
} from "@/lib/audio/wav-render";

function createAudioBufferStub(samples: number[], sampleRate = 44100): AudioBuffer {
  return {
    duration: samples.length / sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("wav rendering", () => {
  it("encodes an AudioBuffer as a PCM WAV file", () => {
    const wav = encodeAudioBufferToWav(createAudioBufferStub([0, 1, -1]));
    const view = new DataView(wav);
    const text = (offset: number, length: number) =>
      String.fromCharCode(
        ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
      );

    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(12, 4)).toBe("fmt ");
    expect(text(36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });

  it("peak-normalizes quiet buffers to the WAV export target", () => {
    const normalized = normalizeAudioBufferPeak(
      createAudioBufferStub([0, 0.05, -0.1]),
    );

    expect(getPeak(normalized)).toBeCloseTo(WAV_EXPORT_TARGET_PEAK, 6);
  });

  it("attenuates hot buffers to the WAV export target", () => {
    const normalized = normalizeAudioBufferPeak(createAudioBufferStub([0, 1, -1]));

    expect(getPeak(normalized)).toBeCloseTo(WAV_EXPORT_TARGET_PEAK, 6);
  });

  it("leaves silent buffers silent", () => {
    const audioBuffer = createAudioBufferStub([0, 0, 0]);

    expect(normalizeAudioBufferPeak(audioBuffer)).toBe(audioBuffer);
  });
});

function getPeak(audioBuffer: { numberOfChannels: number; getChannelData(channel: number): Float32Array }) {
  let peak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      peak = Math.max(peak, Math.abs(data[index] ?? 0));
    }
  }
  return peak;
}
